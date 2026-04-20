import type { ConfigResolverPort } from "../adapters/ports/config-resolver.port.ts";
import type { JobStore } from "../adapters/ports/job-store.port.ts";
import type { SessionStore } from "../adapters/ports/session-store.port.ts";
import type { TelegramTransport } from "../adapters/ports/telegram-transport.port.ts";
import type { Model } from "../entities/backend-config.ts";
import { ConfigError } from "../entities/errors.ts";
import { dispatchCommand, type CommandEffect } from "../usecases/telegram/dispatch-command.ts";
import { parseCommand } from "../usecases/telegram/parse-command.ts";
import type { SettingsField } from "../usecases/update-user-settings.ts";
import {
  renderHelp,
  renderListModels,
  renderSettings,
  renderStats,
  renderWebhookStatus,
  type WebhookStatusProvider,
} from "../usecases/telegram/views.ts";

export interface TelegramPresenterAbortRegistry {
  register(chatId: number): AbortController;
  abort(chatId: number): boolean;
  clear(chatId: number): void;
}

export interface TelegramPresenterSendCall {
  readonly chatId: number;
  readonly text: string;
  readonly signal?: AbortSignal;
}

export interface TelegramPresenterDeps {
  readonly transport: TelegramTransport;
  readonly aborts: TelegramPresenterAbortRegistry;
  readonly sessionStore: SessionStore;
  /** SendMessageToAgent closure from composition. */
  readonly sendMessageToAgent: (call: TelegramPresenterSendCall) => Promise<void>;
  readonly resetSession: (chatId: number) => Promise<void>;
  readonly stopStream: (chatId: number) => boolean;
  readonly setModel: (chatId: number, model: Model) => Promise<void>;
  readonly setSetting: (chatId: number, field: string, value: string) => Promise<void>;
  readonly resetSetting: (chatId: number, field: string) => Promise<void>;
  readonly resolver: ConfigResolverPort;
  readonly workspacePath: (chatId: number) => string | Promise<string>;
  readonly webhookStatus: WebhookStatusProvider;
  /**
   * Optional — when supplied, `/jobs`, `/job <id>` and `/job cancel <id>`
   * resolve against a live JobStore + cancel closure (Phase 8). Absent in
   * legacy tests that don't exercise job commands.
   */
  readonly jobStore?: JobStore;
  readonly cancelJob?: (jobId: number) => Promise<boolean>;
  /** Phase 10: workspace command surface. All optional for legacy tests. */
  readonly switchWorkspace?: (chatId: number, ref: string) => Promise<{ path: string }>;
  readonly createWorkspace?: (chatId: number, name: string) => Promise<{ path: string }>;
  readonly addAllowedWorkspace?: (chatId: number, ref: string) => Promise<{ path: string }>;
  readonly removeAllowedWorkspace?: (chatId: number, ref: string) => Promise<void>;
  readonly listAllowedWorkspaces?: (chatId: number) => Promise<{
    rows: ReadonlyArray<{ path: string }>;
    currentPath: string | null;
  }>;
}

/**
 * Binds a `TelegramTransport` to the full command + free-text pipeline:
 *
 *   - Inbound command (text starts with `/`): parse → dispatch → execute.
 *   - Inbound free-text: register an AbortController in the registry and
 *     invoke `sendMessageToAgent` with the controller's signal so `/stop`
 *     can kill the stream mid-flight.
 *
 * The allow-list gate lives in the transport; the presenter only sees
 * updates from authorized users.
 */
export class TelegramPresenter {
  constructor(private readonly deps: TelegramPresenterDeps) {}

  register(): void {
    this.deps.transport.onUpdate(async (update) => {
      if (update.text === undefined) return;
      const { chatId, text } = update;
      const cmd = parseCommand(text);
      if (cmd !== null) {
        await this.handleCommand(chatId, dispatchCommand(cmd));
        return;
      }
      await this.handleFreeText(chatId, text);
    });
  }

  private async handleCommand(chatId: number, effect: CommandEffect): Promise<void> {
    const { transport } = this.deps;
    switch (effect.kind) {
      case "resetSession":
        await this.deps.resetSession(chatId);
        await transport.sendMessage(chatId, "New session started.");
        return;
      case "stopStream": {
        const stopped = this.deps.stopStream(chatId);
        await transport.sendMessage(
          chatId,
          stopped ? "Stream stopped." : "No active stream to stop.",
        );
        return;
      }
      case "setModel":
        try {
          await this.deps.setModel(chatId, effect.model);
          await transport.sendMessage(chatId, `Model set to ${effect.model}.`);
        } catch (err) {
          await transport.sendMessage(chatId, renderError(err));
        }
        return;
      case "listModels":
        await transport.sendMessage(chatId, renderListModels());
        return;
      case "showSettings": {
        const ws = await this.deps.workspacePath(chatId);
        await transport.sendMessage(
          chatId,
          renderSettings({ chatId, workspacePath: ws, resolver: this.deps.resolver }),
        );
        return;
      }
      case "setSetting":
        try {
          await this.deps.setSetting(chatId, effect.field, effect.value);
          await transport.sendMessage(chatId, `${effect.field} set to ${effect.value}.`);
        } catch (err) {
          await transport.sendMessage(chatId, renderError(err));
        }
        return;
      case "resetSetting":
        try {
          await this.deps.resetSetting(chatId, effect.field);
          await transport.sendMessage(chatId, `${effect.field} reset to default.`);
        } catch (err) {
          await transport.sendMessage(chatId, renderError(err));
        }
        return;
      case "showHelp":
        await transport.sendMessage(chatId, renderHelp());
        return;
      case "showStats":
        await transport.sendMessage(
          chatId,
          await renderStats({ chatId, sessionStore: this.deps.sessionStore }),
        );
        return;
      case "showWebhooks":
        await transport.sendMessage(
          chatId,
          renderWebhookStatus({ endpoints: this.deps.webhookStatus.snapshot() }),
        );
        return;
      case "listJobs":
        await this.handleListJobs(chatId);
        return;
      case "showJob":
        await this.handleShowJob(chatId, effect.jobId);
        return;
      case "cancelJob":
        await this.handleCancelJob(chatId, effect.jobId);
        return;
      case "listWorkspaces":
        await this.handleListWorkspaces(chatId);
        return;
      case "showWorkspace": {
        const ws = await this.deps.workspacePath(chatId);
        await transport.sendMessage(chatId, `Current workspace: ${ws}`);
        return;
      }
      case "switchWorkspace":
        await this.handleSwitchWorkspace(chatId, effect.ref);
        return;
      case "createWorkspace":
        await this.handleCreateWorkspace(chatId, effect.name);
        return;
      case "allowWorkspace":
        await this.handleAddAllow(chatId, effect.ref);
        return;
      case "denyWorkspace":
        await this.handleRemoveAllow(chatId, effect.ref);
        return;
      case "notImplemented":
        await transport.sendMessage(
          chatId,
          `/${effect.area} commands are not yet implemented in M1 core.`,
          // TODO(phase-10): wire workspace handlers.
        );
        return;
      case "unknownCommand":
        await transport.sendMessage(chatId, `Unknown command: /${effect.command}. Try /help.`);
        return;
      case "replyError":
        await transport.sendMessage(chatId, effect.message);
        return;
    }
  }

  private async handleListJobs(chatId: number): Promise<void> {
    const { transport, jobStore } = this.deps;
    if (!jobStore) {
      await transport.sendMessage(chatId, "Job store not wired.");
      return;
    }
    const rows = await jobStore.list(chatId);
    if (rows.length === 0) {
      await transport.sendMessage(chatId, "No scheduled jobs.");
      return;
    }
    const lines = ["Your scheduled jobs:"];
    for (const j of rows) {
      lines.push(
        `  #${j.id} ${j.name} [${j.jobType}] — ${describeSchedule(j.schedule)}${
          j.active ? "" : " (paused)"
        }`,
      );
    }
    await transport.sendMessage(chatId, lines.join("\n"));
  }

  private async handleShowJob(chatId: number, jobId: number): Promise<void> {
    const { transport, jobStore } = this.deps;
    if (!jobStore) {
      await transport.sendMessage(chatId, "Job store not wired.");
      return;
    }
    const row = await jobStore.get(jobId);
    if (!row || row.chatId !== chatId) {
      await transport.sendMessage(chatId, `Job ${jobId} not found.`);
      return;
    }
    await transport.sendMessage(
      chatId,
      [
        `Job #${row.id}: ${row.name}`,
        `  type: ${row.jobType}`,
        `  schedule: ${describeSchedule(row.schedule)}`,
        `  active: ${row.active}`,
        `  auto_remove: ${row.autoRemove}`,
        `  prompt: ${row.prompt}`,
      ].join("\n"),
    );
  }

  private async handleCancelJob(chatId: number, jobId: number): Promise<void> {
    const { transport, jobStore, cancelJob } = this.deps;
    if (!jobStore || !cancelJob) {
      await transport.sendMessage(chatId, "Job scheduler not wired.");
      return;
    }
    const existing = await jobStore.get(jobId);
    if (!existing || existing.chatId !== chatId) {
      await transport.sendMessage(chatId, `Job ${jobId} not found.`);
      return;
    }
    const removed = await cancelJob(jobId);
    await transport.sendMessage(chatId, removed ? `Job ${jobId} cancelled.` : "Nothing to cancel.");
  }

  private async handleListWorkspaces(chatId: number): Promise<void> {
    const { transport, listAllowedWorkspaces } = this.deps;
    if (!listAllowedWorkspaces) {
      await transport.sendMessage(chatId, "Workspace commands not wired.");
      return;
    }
    const { rows, currentPath } = await listAllowedWorkspaces(chatId);
    if (rows.length === 0) {
      await transport.sendMessage(chatId, "No allowed workspaces.");
      return;
    }
    const lines = ["Allowed workspaces:"];
    for (const r of rows) {
      const marker = r.path === currentPath ? "• " : "  ";
      lines.push(`${marker}${r.path}`);
    }
    await transport.sendMessage(chatId, lines.join("\n"));
  }

  private async handleSwitchWorkspace(chatId: number, ref: string): Promise<void> {
    const { transport, switchWorkspace } = this.deps;
    if (!switchWorkspace) {
      await transport.sendMessage(chatId, "Workspace commands not wired.");
      return;
    }
    try {
      const { path } = await switchWorkspace(chatId, ref);
      await transport.sendMessage(chatId, `Switched to ${path}.`);
    } catch (err) {
      await transport.sendMessage(chatId, renderError(err));
    }
  }

  private async handleCreateWorkspace(chatId: number, name: string): Promise<void> {
    const { transport, createWorkspace } = this.deps;
    if (!createWorkspace) {
      await transport.sendMessage(chatId, "Workspace commands not wired.");
      return;
    }
    try {
      const { path } = await createWorkspace(chatId, name);
      await transport.sendMessage(chatId, `Created and switched to ${path}.`);
    } catch (err) {
      await transport.sendMessage(chatId, renderError(err));
    }
  }

  private async handleAddAllow(chatId: number, ref: string): Promise<void> {
    const { transport, addAllowedWorkspace } = this.deps;
    if (!addAllowedWorkspace) {
      await transport.sendMessage(chatId, "Workspace commands not wired.");
      return;
    }
    try {
      const { path } = await addAllowedWorkspace(chatId, ref);
      await transport.sendMessage(chatId, `Added ${path} to allow-list.`);
    } catch (err) {
      await transport.sendMessage(chatId, renderError(err));
    }
  }

  private async handleRemoveAllow(chatId: number, ref: string): Promise<void> {
    const { transport, removeAllowedWorkspace } = this.deps;
    if (!removeAllowedWorkspace) {
      await transport.sendMessage(chatId, "Workspace commands not wired.");
      return;
    }
    try {
      await removeAllowedWorkspace(chatId, ref);
      await transport.sendMessage(chatId, `Removed ${ref} from allow-list.`);
    } catch (err) {
      await transport.sendMessage(chatId, renderError(err));
    }
  }

  private async handleFreeText(chatId: number, text: string): Promise<void> {
    const ctrl = this.deps.aborts.register(chatId);
    try {
      await this.deps.sendMessageToAgent({ chatId, text, signal: ctrl.signal });
    } finally {
      this.deps.aborts.clear(chatId);
    }
  }
}

function describeSchedule(s: import("../entities/job.ts").Schedule): string {
  switch (s.kind) {
    case "once":
      return `once at ${s.atIso}`;
    case "interval":
      return `every ${s.seconds}s${s.firstRunIso ? ` (start ${s.firstRunIso})` : ""}`;
    case "daily":
      return `daily at ${s.timesUtc.join(", ")} UTC`;
  }
}

function renderError(err: unknown): string {
  if (err instanceof ConfigError) return err.message;
  if (err instanceof Error) return err.message;
  return "Operation failed.";
}

/** Build the simple webhook status provider (M1: constants from composition). */
export function makeStaticWebhookStatus(
  endpoints: WebhookStatusProvider["snapshot"] extends () => infer R ? R : never,
): WebhookStatusProvider {
  return { snapshot: () => endpoints };
}

/** Helper type re-export for convenience. */
export type { SettingsField };
