import type {
  ConfigResolverPort,
  ResolvableField,
  ResolvedField,
} from "../adapters/ports/config-resolver.port.ts";
import type { LoggerPort } from "../adapters/ports/logger.port.ts";
import type { SettingsStore } from "../adapters/ports/settings-store.port.ts";
import {
  resolveUserBackendConfig,
  type ProviderFn,
  type RawValue,
} from "../usecases/resolve-user-backend-config.ts";
import type { UsersRepo } from "../infra/config/users-repo.ts";
import type { WorkspacesRepo } from "../infra/config/workspaces-repo.ts";

/**
 * Snapshot of the `settings` table at boot — keyed by the same namespaced
 * keys the real `SqliteSettingsStore` emits. The resolver walks this in-
 * memory map so `resolve()` is O(1) and can stay synchronous.
 */
export interface SettingsSnapshot {
  get(key: string): string | null;
}

/** Minimal env reader used for tier 5. */
export interface EnvReader {
  readonly LUNA_MODEL?: string;
  readonly LUNA_TIMEOUT_S?: string | number;
  readonly LUNA_BUDGET_USD?: string | number;
  readonly LUNA_CONTEXT_WINDOW?: string | number;
  readonly IDLE_TIMEOUT_MIN?: string | number;
}

/** Hardcoded tier-6 defaults. Tuned to match the M1 design's out-of-box feel. */
export const DEFAULTS: Record<ResolvableField, string | number> = {
  model: "sonnet",
  timeoutSeconds: 300,
  maxBudgetUsd: 0,
  contextWindow: 200_000,
  idleTimeoutMin: 15,
};

const YAML_FIELD_KEY: Record<ResolvableField, string> = {
  model: "model",
  timeoutSeconds: "timeout_s",
  maxBudgetUsd: "budget_usd",
  contextWindow: "context_window",
  idleTimeoutMin: "idle_timeout_min",
};

const ENV_FIELD_KEY: Record<ResolvableField, keyof EnvReader> = {
  model: "LUNA_MODEL",
  timeoutSeconds: "LUNA_TIMEOUT_S",
  maxBudgetUsd: "LUNA_BUDGET_USD",
  contextWindow: "LUNA_CONTEXT_WINDOW",
  idleTimeoutMin: "IDLE_TIMEOUT_MIN",
};

const DB_FIELD_SUFFIX: Record<ResolvableField, string> = {
  model: "model",
  timeoutSeconds: "timeout_s",
  maxBudgetUsd: "budget_usd",
  contextWindow: "context_window",
  idleTimeoutMin: "idle_timeout_min",
};

/**
 * Reads the user record from `users.yaml` as a raw tier-4 value. Accepts
 * YAML keys (`timeout_s`) and maps them to the field name.
 */
function usersYamlProvider(usersRepo: UsersRepo): ProviderFn {
  return (chatId, _ws, field) => {
    const entry = usersRepo.byTelegramId(chatId);
    if (!entry) return null;
    const key = YAML_FIELD_KEY[field] as keyof typeof entry;
    return (entry[key] as RawValue) ?? null;
  };
}

function workspacesYamlProvider(wsRepo: WorkspacesRepo): ProviderFn {
  return (_chat, ws, field) => {
    const entry = wsRepo.byPath(ws);
    if (!entry?.claude) return null;
    const key = YAML_FIELD_KEY[field] as keyof NonNullable<typeof entry.claude>;
    return (entry.claude[key] as RawValue) ?? null;
  };
}

function envProvider(env: EnvReader): ProviderFn {
  return (_chat, _ws, field) => (env[ENV_FIELD_KEY[field]] as RawValue) ?? null;
}

function defaultsProvider(): ProviderFn {
  return (_chat, _ws, field) => DEFAULTS[field];
}

function workspaceDbProvider(snap: SettingsSnapshot): ProviderFn {
  return (chatId, ws, field) => snap.get(`ws_config:${chatId}:${ws}:${DB_FIELD_SUFFIX[field]}`);
}

function userDbProvider(snap: SettingsSnapshot): ProviderFn {
  return (chatId, _ws, field) => snap.get(`user_config:${chatId}:${DB_FIELD_SUFFIX[field]}`);
}

/** Load a `SettingsSnapshot` by streaming `ws_config:*` + `user_config:*`. */
export async function loadSettingsSnapshot(store: SettingsStore): Promise<SettingsSnapshot> {
  const entries = [
    ...(await store.listPrefix("ws_config:")),
    ...(await store.listPrefix("user_config:")),
  ];
  const map = new Map(entries.map((e) => [e.key, e.value] as const));
  return {
    get(key) {
      return map.get(key) ?? null;
    },
  };
}

export interface SnapshotResolverDeps {
  readonly snapshot: SettingsSnapshot;
  readonly users: UsersRepo;
  readonly workspaces: WorkspacesRepo;
  readonly env: EnvReader;
  readonly logger?: LoggerPort;
}

/**
 * Concrete `ConfigResolverPort` wiring all Phase-3 stores into the pure
 * tier walker. Call `loadSettingsSnapshot` + `UsersRepo.fromFile` +
 * `WorkspacesRepo.fromFile` at boot, then construct this once.
 */
export class SnapshotConfigResolver implements ConfigResolverPort {
  constructor(private readonly deps: SnapshotResolverDeps) {}

  resolve(chatId: number, workspacePath: string, field: ResolvableField): ResolvedField | null {
    return resolveUserBackendConfig(
      {
        workspaceDb: workspaceDbProvider(this.deps.snapshot),
        workspaceYaml: workspacesYamlProvider(this.deps.workspaces),
        userDb: userDbProvider(this.deps.snapshot),
        usersYaml: usersYamlProvider(this.deps.users),
        env: envProvider(this.deps.env),
        defaults: defaultsProvider(),
        ...(this.deps.logger ? { logger: this.deps.logger } : {}),
      },
      chatId,
      workspacePath,
      field,
    );
  }
}
