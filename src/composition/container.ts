import { join } from "node:path";
import type { AllowedWorkspaceStore } from "../adapters/ports/allowed-workspace-store.port.ts";
import type { HistoryStore } from "../adapters/ports/history-store.port.ts";
import type { JobStore } from "../adapters/ports/job-store.port.ts";
import type { LockPort } from "../adapters/ports/lock.port.ts";
import type { SessionStore } from "../adapters/ports/session-store.port.ts";
import type { SettingsStore } from "../adapters/ports/settings-store.port.ts";
import type { WorkspaceHistoryStore } from "../adapters/ports/workspace-history-store.port.ts";
import { SystemClock } from "../infra/clock/system-clock.ts";
import { openDb, type LunaDb } from "../infra/db/client.ts";
import { SqliteAllowedWorkspaceStore } from "../infra/db/sqlite-allowed-workspace-store.ts";
import { SqliteJobStore } from "../infra/db/sqlite-job-store.ts";
import { SqliteSessionStore } from "../infra/db/sqlite-session-store.ts";
import { SqliteSettingsStore } from "../infra/db/sqlite-settings-store.ts";
import { SqliteWorkspaceHistoryStore } from "../infra/db/sqlite-workspace-history-store.ts";
import {
  loadSettingsSnapshot,
  SnapshotConfigResolver,
  type EnvReader,
} from "./snapshot-config-resolver.ts";
import { UsersRepo } from "../infra/config/users-repo.ts";
import { WorkspacesRepo } from "../infra/config/workspaces-repo.ts";
import type { ConfigResolverPort } from "../adapters/ports/config-resolver.port.ts";
import { JsonlHistoryStore } from "../infra/fs/jsonl-history-store.ts";
import { NodeFsPort } from "../infra/fs/node-fs-port.ts";
import { AsyncMutexLockPort } from "../infra/locks/async-mutex-lock-port.ts";
import { EchoBackend } from "../infra/backends/echo-backend.ts";
import {
  GrammyTelegramTransport,
  realGrammyBotFactory,
  type GrammyLikeBot,
} from "../infra/telegram/grammy-transport.ts";
import { makeSendMessageToAgent } from "../usecases/send-message-to-agent.ts";
import { TracerEnvSchema } from "./env-schema.ts";

export interface TracerContainer {
  start(): Promise<void>;
  stop(): Promise<void>;
}

export interface BuildTracerContainerOptions {
  env: Record<string, string | undefined>;
  /** Optional — tests inject a fake grammY Bot; prod uses the real factory. */
  botFactory?: () => GrammyLikeBot;
}

/**
 * Phase-0 tracer composition root. Wires EchoBackend + GrammyTransport +
 * SendMessageToAgent. No DB, no scheduler, no HTTP yet.
 */
export function buildTracerContainer(opts: BuildTracerContainerOptions): TracerContainer {
  const env = TracerEnvSchema.parse(opts.env);
  const botFactory = opts.botFactory ?? realGrammyBotFactory(env.TELEGRAM_BOT_TOKEN);

  const transport = new GrammyTelegramTransport({
    botFactory,
    allowList: env.TELEGRAM_ALLOWED_IDS,
  });
  const backend = new EchoBackend();
  const sendMessageToAgent = makeSendMessageToAgent({
    backend,
    telegram: transport,
    defaultConfig: {
      model: "sonnet",
      timeoutS: 300,
      budgetUsd: 0,
      contextWindow: 200_000,
    },
  });

  transport.onUpdate(async ({ chatId, text }) => {
    if (text === undefined) return;
    await sendMessageToAgent(chatId, text);
  });

  return {
    async start() {
      await transport.start();
    },
    async stop() {
      await transport.stop();
    },
  };
}

/**
 * "Real-mode" store bundle. Produced by `buildStoresContainer` when
 * `LUNA_MODE=real`. Phase 3's deliverable — Phase 5+ extend this with
 * backend pool, scheduler, HTTP, etc.
 */
export interface StoresContainer {
  readonly db: LunaDb;
  readonly sessionStore: SessionStore;
  readonly jobStore: JobStore;
  readonly settingsStore: SettingsStore;
  readonly allowedWorkspaceStore: AllowedWorkspaceStore;
  readonly workspaceHistoryStore: WorkspaceHistoryStore;
  readonly historyStore: HistoryStore;
  readonly lock: LockPort;
  close(): void;
}

export interface BuildStoresContainerOptions {
  /** Absolute path to the SQLite DB file. `:memory:` for tests. */
  dbUrl: string;
  /** Root directory under which chat JSONL histories are rotated. */
  historyDir: string;
}

/**
 * Opens the DB + wires every Phase-3 store onto a shared `LunaDb`. Does NOT
 * run migrations — callers invoke `applyMigrations(db)` explicitly so the
 * migration runner stays a first-class, testable operation.
 */
export function buildStoresContainer(opts: BuildStoresContainerOptions): StoresContainer {
  const db = openDb(opts.dbUrl);
  const clock = new SystemClock();
  const fs = new NodeFsPort();
  return {
    db,
    sessionStore: new SqliteSessionStore(db),
    jobStore: new SqliteJobStore(db),
    settingsStore: new SqliteSettingsStore(db),
    allowedWorkspaceStore: new SqliteAllowedWorkspaceStore(db),
    workspaceHistoryStore: new SqliteWorkspaceHistoryStore(db),
    historyStore: new JsonlHistoryStore(fs, clock, opts.historyDir),
    lock: new AsyncMutexLockPort(),
    close() {
      db.$raw.close();
    },
  };
}

/**
 * Phase-4 add-on: build the live `ConfigResolverPort` once the settings
 * snapshot + YAML repos are in hand.
 */
export async function buildConfigResolver(
  stores: StoresContainer,
  opts: { usersYamlPath: string; workspacesYamlPath: string; env: EnvReader },
): Promise<ConfigResolverPort> {
  const snapshot = await loadSettingsSnapshot(stores.settingsStore);
  return new SnapshotConfigResolver({
    snapshot,
    users: UsersRepo.fromFile(opts.usersYamlPath),
    workspaces: WorkspacesRepo.fromFile(opts.workspacesYamlPath),
    env: opts.env,
  });
}

/** Env keys the Phase-3 real-mode wiring consults. */
export interface RealModeEnv {
  readonly LUNA_MODE?: string;
  readonly DATA_DIR?: string;
  readonly LUNA_DB_URL?: string;
}

/**
 * Resolves DB + history paths from env. `LUNA_DB_URL` wins over
 * `DATA_DIR/luna.db` so tests can override without polluting DATA_DIR.
 */
export function storesOptionsFromEnv(env: RealModeEnv): BuildStoresContainerOptions {
  const dataDir = env.DATA_DIR ?? ".";
  return {
    dbUrl: env.LUNA_DB_URL ?? join(dataDir, "luna.db"),
    historyDir: join(dataDir, "history"),
  };
}
