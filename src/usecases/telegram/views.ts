import type {
  ConfigResolverPort,
  PrecedenceTier,
  ResolvableField,
} from "../../adapters/ports/config-resolver.port.ts";
import type { SessionStore } from "../../adapters/ports/session-store.port.ts";

/**
 * Pure text renderers for Telegram-facing read commands (`/help`, `/models`,
 * `/settings`, `/stats`, `/webhooks`). No I/O except the single optional
 * SettingsStore/SessionStore read per call.
 */

const TIER_LABEL: Record<PrecedenceTier, string> = {
  1: "workspace DB",
  2: "workspaces.yaml",
  3: "user DB",
  4: "users.yaml",
  5: "env",
  6: "default",
};

const FIELD_LABELS: Record<ResolvableField, string> = {
  model: "model",
  timeoutSeconds: "timeout_s",
  maxBudgetUsd: "budget_usd",
  contextWindow: "context_window",
  idleTimeoutMin: "idle_timeout_min",
};

const FIELDS: readonly ResolvableField[] = [
  "model",
  "timeoutSeconds",
  "maxBudgetUsd",
  "contextWindow",
  "idleTimeoutMin",
];

export function renderHelp(): string {
  return [
    "Available commands:",
    "/new — reset the conversation and start a fresh Claude session",
    "/stop — abort the currently streaming response",
    "/model <name> — switch model (opus | sonnet | haiku)",
    "/models — list allowed models",
    "/settings [field] [value] — view or change per-user settings",
    "/settings reset <field> — revert a field to its default tier",
    "/workspace [path] — show or switch current workspace",
    "/ws [path] — alias of /workspace",
    "/workspace-new <path> — create a new workspace directory",
    "/workspace-home — reset to the home workspace",
    "/workspace-allow <path> — add a workspace to the allow-list",
    "/workspace-deny <path> — remove a workspace from the allow-list",
    "/workspace-allowed — list allowed workspaces",
    "/workspaces — list recently-used workspaces",
    "/job [id] — show a specific job",
    "/jobs — list active scheduled jobs",
    "/jobs-info — scheduler health + next fire times",
    "/jobs-cancel <id> — cancel a scheduled job",
    "/webhooks — show HTTP endpoint status",
    "/help — show this help",
    "/stats — session info, model, running cost",
  ].join("\n");
}

export function renderListModels(): string {
  return "Allowed models: opus, sonnet, haiku";
}

export interface RenderSettingsInput {
  readonly chatId: number;
  readonly workspacePath: string;
  readonly resolver: ConfigResolverPort;
}

export function renderSettings(input: RenderSettingsInput): string {
  const lines = ["Your resolved settings:"];
  for (const field of FIELDS) {
    const resolved = input.resolver.resolve(input.chatId, input.workspacePath, field);
    if (!resolved) {
      lines.push(`${FIELD_LABELS[field]}: <unresolved>`);
      continue;
    }
    lines.push(`${FIELD_LABELS[field]}: ${resolved.value} (${TIER_LABEL[resolved.tier]})`);
  }
  return lines.join("\n");
}

export interface RenderStatsInput {
  readonly chatId: number;
  readonly sessionStore: SessionStore;
}

export async function renderStats(input: RenderStatsInput): Promise<string> {
  const row = await input.sessionStore.get(input.chatId);
  if (!row || !row.sessionId) {
    return "No active session. Send a message to start one.";
  }
  return [
    `Session: ${row.sessionId}`,
    `Model: ${row.model}`,
    `Cost so far: $${row.totalCostUsd.toFixed(2)}`,
    `Last used: ${row.lastUsedAt.toISOString()}`,
  ].join("\n");
}

export interface WebhookEndpointStatus {
  readonly name: string;
  readonly enabled: boolean;
  readonly lastEventAtIso: string | null;
}

export interface RenderWebhookStatusInput {
  readonly endpoints: readonly WebhookEndpointStatus[];
}

export function renderWebhookStatus(input: RenderWebhookStatusInput): string {
  if (input.endpoints.length === 0) return "No webhook endpoints configured.";
  const lines = ["Webhook endpoints:"];
  for (const e of input.endpoints) {
    const state = e.enabled ? "enabled" : "disabled";
    const last = e.lastEventAtIso ?? "never";
    lines.push(`  ${e.name}: ${state}, last event: ${last}`);
  }
  return lines.join("\n");
}

/** Port for webhook endpoint status — implemented by the composition root. */
export interface WebhookStatusProvider {
  snapshot(): readonly WebhookEndpointStatus[];
}
