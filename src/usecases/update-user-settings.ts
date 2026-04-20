import type { SettingsStore } from "../adapters/ports/settings-store.port.ts";
import type { Model } from "../entities/backend-config.ts";
import { ConfigError } from "../entities/errors.ts";

/**
 * The settings fields a user may tweak via `/model` / `/settings <field> <value>`.
 * Field names here match `ResolvableField` (camelCase) for symmetry with the
 * config resolver; DB keys are serialized in snake_case to match YAML +
 * SettingsStore conventions.
 */
export type SettingsField =
  | "model"
  | "timeoutSeconds"
  | "maxBudgetUsd"
  | "contextWindow"
  | "idleTimeoutMin";

/** camelCase field → snake_case DB suffix. Mirrors SnapshotConfigResolver. */
export const SETTINGS_FIELD_KEYS: Record<SettingsField, string> = {
  model: "model",
  timeoutSeconds: "timeout_s",
  maxBudgetUsd: "budget_usd",
  contextWindow: "context_window",
  idleTimeoutMin: "idle_timeout_min",
};

const MODELS: ReadonlySet<Model> = new Set(["opus", "sonnet", "haiku"]);

export interface UpdateUserSettingsDeps {
  readonly settings: SettingsStore;
  /**
   * Called after each write. The composition root rebuilds the settings
   * snapshot so a subsequent `resolve()` sees the change immediately.
   */
  readonly refreshSnapshot: (chatId: number) => Promise<void>;
}

export function makeUpdateUserSettings(deps: UpdateUserSettingsDeps) {
  async function set(chatId: number, field: SettingsField, raw: string): Promise<void> {
    validateField(field);
    const serialized = coerce(field, raw);
    await deps.settings.set(userKey(chatId, field), serialized);
    await deps.refreshSnapshot(chatId);
  }

  async function reset(chatId: number, field: SettingsField): Promise<void> {
    validateField(field);
    await deps.settings.delete(userKey(chatId, field));
    await deps.refreshSnapshot(chatId);
  }

  return { set, reset };
}

export type UpdateUserSettings = ReturnType<typeof makeUpdateUserSettings>;

function userKey(chatId: number, field: SettingsField): string {
  return `user_config:${chatId}:${SETTINGS_FIELD_KEYS[field]}`;
}

function validateField(field: SettingsField): void {
  if (!(field in SETTINGS_FIELD_KEYS)) {
    throw new ConfigError(`unknown field: ${field}`);
  }
}

function coerce(field: SettingsField, raw: string): string {
  if (field === "model") {
    if (!MODELS.has(raw as Model)) throw new ConfigError(`unknown model: ${raw}`);
    return raw;
  }
  const n = Number(raw);
  if (!Number.isFinite(n)) throw new ConfigError(`${field}: must be an integer`);
  if (field === "maxBudgetUsd") {
    if (n < 0) throw new ConfigError(`${field}: must be non-negative`);
    return String(n);
  }
  if (!Number.isInteger(n)) throw new ConfigError(`${field}: must be an integer`);
  if (n <= 0) throw new ConfigError(`${field}: must be positive`);
  return String(n);
}
