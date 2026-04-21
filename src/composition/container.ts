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
import type { ResolvableField } from "../adapters/ports/config-resolver.port.ts";
import type { MessageLine } from "../entities/message.ts";

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
  const consoleLogger: import("../adapters/ports/logger.port.ts").LoggerPort = {
    debug: (m, meta) => console.log("[debug]", m, meta ?? ""),
    info: (m, meta) => console.log("[info]", m, meta ?? ""),
    warn: (m, meta) => console.warn("[warn]", m, meta ?? ""),
    error: (m, meta) => console.error("[error]", m, meta ?? ""),
    child() {
      return consoleLogger;
    },
  };

  const transport = new GrammyTelegramTransport({
    botFactory,
    allowList: env.TELEGRAM_ALLOWED_IDS,
    logger: consoleLogger,
  });
  const backend = new EchoBackend();
  const clock = new SystemClock();
  const tracerHistory = tracerHistoryStore();
  const tracerCrash = tracerCrashRecoveryPort();
  const tracerSession = tracerSessionStore();
  // ^ in-memory session store stub so the full SendMessageToAgent pipeline
  // (with SessionStore.upsert on done) has an impl to talk to without
  // requiring migrated SQLite for the tracer.
  const sendMessageToAgent = makeSendMessageToAgent({
    backend,
    telegram: transport,
    resolver: tracerResolver(),
    sessionStore: tracerSession,
    historyStore: tracerHistory,
    crashRecovery: tracerCrash,
    locks: new AsyncMutexLockPort(),
    clock,
    resolveWorkspacePath: () => "/",
  });

  transport.onUpdate(async ({ chatId, text }) => {
    if (text === undefined) return;
    await sendMessageToAgent({ chatId, text });
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

// ── tracer helpers ────────────────────────────────────────────────────────
// In-memory stubs used only by `buildTracerContainer` so the full
// SendMessageToAgent pipeline (resolver, session store, history, crash
// recovery, locks) can run without touching disk. Real-mode wiring is handled
// by `buildStoresContainer` + Phase 5.12 composition.

function tracerResolver() {
  const DEFAULTS: Record<ResolvableField, { value: string | number; tier: 6 }> = {
    model: { value: "sonnet", tier: 6 },
    timeoutSeconds: { value: 300, tier: 6 },
    maxBudgetUsd: { value: 0, tier: 6 },
    contextWindow: { value: 200_000, tier: 6 },
    idleTimeoutMin: { value: 15, tier: 6 },
  };
  return {
    resolve(_c: number, _w: string, field: ResolvableField) {
      return DEFAULTS[field];
    },
  };
}

function tracerHistoryStore(): HistoryStore {
  const lines: MessageLine[] = [];
  return {
    async append(_chatId: number, line: MessageLine) {
      lines.push(line);
    },
    async tail(chatId: number, n: number) {
      return lines.filter((l) => l.chatId === chatId).slice(-n);
    },
  };
}

function tracerCrashRecoveryPort() {
  const pending = new Set<number>();
  return {
    async mark(chatId: number) {
      pending.add(chatId);
    },
    async clear(chatId: number) {
      pending.delete(chatId);
    },
    async listPending() {
      return [...pending];
    },
  };
}

function tracerSessionStore(): SessionStore {
  const rows = new Map<number, import("../adapters/ports/session-store.port.ts").SessionRow>();
  return {
    async get(chatId) {
      return rows.get(chatId) ?? null;
    },
    async upsert(row) {
      rows.set(row.chatId, { ...row });
    },
    async clear(chatId) {
      rows.delete(chatId);
    },
    async addCost(chatId, delta) {
      const r = rows.get(chatId);
      if (!r) return;
      rows.set(chatId, { ...r, totalCostUsd: r.totalCostUsd + delta });
    },
  };
}
