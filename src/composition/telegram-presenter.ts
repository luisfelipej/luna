import type { ConfigResolverPort } from "../adapters/ports/config-resolver.port.ts";
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
      case "notImplemented":
        await transport.sendMessage(
          chatId,
          `/${effect.area} commands are not yet implemented in M1 core.`,
          // TODO(phase-${effect.area === "workspace" ? "10" : "8"}): wire real handlers.
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

  private async handleFreeText(chatId: number, text: string): Promise<void> {
    const ctrl = this.deps.aborts.register(chatId);
    try {
      await this.deps.sendMessageToAgent({ chatId, text, signal: ctrl.signal });
    } finally {
      this.deps.aborts.clear(chatId);
    }
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
