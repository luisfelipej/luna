import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { ConfigResolverPort } from "../adapters/ports/config-resolver.port.ts";
import type { ServiceProxyPort } from "../adapters/ports/service-proxy.port.ts";
import type { TelegramTransport } from "../adapters/ports/telegram-transport.port.ts";
import type { WebhookServerPort } from "../adapters/ports/webhook-server.port.ts";
import { SystemClock } from "../infra/clock/system-clock.ts";
import { UsersRepo } from "../infra/config/users-repo.ts";
import { WorkspacesRepo } from "../infra/config/workspaces-repo.ts";
import type { LunaDb } from "../infra/db/client.ts";
import type { SpawnPort } from "../infra/backends/spawn-port.ts";
import { HonoWebhookServer } from "./http/hono-webhook-server.ts";
import {
  GrammyTelegramTransport,
  realGrammyBotFactory,
} from "../infra/telegram/grammy-transport.ts";
import { makeRestoreOnStart } from "../usecases/restore-on-start.ts";
import { makeResetSession } from "../usecases/reset-session.ts";
import { makeStopStream } from "../usecases/stop-stream.ts";
import { makeSendMessageToAgent } from "../usecases/send-message-to-agent.ts";
import { makeUpdateUserSettings } from "../usecases/update-user-settings.ts";
import { makeRouteWebhookEvent } from "../usecases/http/route-webhook-event.ts";
import { makeScheduleJob } from "../usecases/http/schedule-job.ts";
import { makeSendProactiveMessage } from "../usecases/http/send-proactive-message.ts";
import { makeRunScheduledFire } from "../usecases/scheduler/run-scheduled-fire.ts";
import { makeCancelJob } from "../usecases/scheduler/cancel-job.ts";
import { LoopScheduler } from "./scheduler/loop-scheduler.ts";
import { buildClaudeAgentBackend } from "./claude-backend-container.ts";
import { buildStoresContainer, storesOptionsFromEnv } from "./container.ts";
import { buildRefreshableSnapshotResolver, type EnvReader } from "./snapshot-config-resolver.ts";
import { TelegramPresenter } from "./telegram-presenter.ts";
import type { WebhookStatusProvider } from "../usecases/telegram/views.ts";

/**
 * Full-mode app container. Wires:
 *   - Real GrammyTelegramTransport (or an injected fake for tests)
 *   - SQLite stores (sessions/jobs/settings/workspaces/history) via Drizzle
 *   - Claude backend pool + eviction walker + crash recovery + abort registry
 *   - Refreshable settings snapshot + config resolver
 *   - TelegramPresenter wired to SendMessageToAgent + command dispatch
 *   - RestoreOnStart hook drained before `transport.start()`
 *   - Scheduler: STUB (Phase 8) — `rehydrateScheduler` is a safe no-op.
 *   - Webhook server: STUB (Phase 7) — status provider returns empty set.
 */
export interface FullAppContainer {
  start(): Promise<void>;
  stop(): Promise<void>;
  /** Exposed for tests; not used by `main.ts`. */
  readonly transport: TelegramTransport;
  readonly resolver: ConfigResolverPort;
  readonly webhookServer: WebhookServerPort;
  readonly shutdownBackend: () => Promise<void>;
}

export interface BuildFullAppContainerOptions {
  readonly env: Record<string, string | undefined>;
  /** Path to the SQLite DB. Defaults to `${DATA_DIR}/luna.db` from env. */
  readonly dbUrl?: string;
  /** Test override: supply a FakeTelegramTransport instead of real grammY. */
  readonly transportOverride?: TelegramTransport;
  /** Test override: supply a FakeSpawn.spawn instead of node spawn. */
  readonly spawnOverride?: SpawnPort;
  /** Explicit YAML path (null = skip, use empty repos). */
  readonly usersYamlPath?: string | null;
  readonly workspacesYamlPath?: string | null;
  /**
   * Override the webhook status provider (defaults to a live snapshot of
   * the wired `HonoWebhookServer`).
   */
  readonly webhookStatus?: WebhookStatusProvider;
  /**
   * If true (default), boot the Hono HTTP server on start and stop it on
   * stop. Tests disable this to avoid binding sockets.
   */
  readonly startHttpServer?: boolean;
  /**
   * Phase 9 supplies the real ServiceProxyPort; Phase 7 leaves this
   * undefined so `POST /api/service/:name` replies 501.
   */
  readonly serviceProxy?: ServiceProxyPort;
}

export async function buildFullAppContainer(
  opts: BuildFullAppContainerOptions,
): Promise<FullAppContainer> {
  const env = opts.env;
  const token = env.TELEGRAM_BOT_TOKEN ?? "";
  const allowList = parseAllowList(env.TELEGRAM_ALLOWED_IDS ?? "");
  const dataDir = env.DATA_DIR ?? process.cwd();

  const storesOpts = opts.dbUrl
    ? { dbUrl: opts.dbUrl, historyDir: join(dataDir, "history") }
    : storesOptionsFromEnv(env);
  const stores = buildStoresContainer(storesOpts);

  // Apply any pending migrations before first use.
  applyBundledMigrations(stores.db);

  const usersRepo =
    opts.usersYamlPath != null
      ? UsersRepo.fromFile(opts.usersYamlPath)
      : new UsersRepo("users: []");
  const workspacesRepo =
    opts.workspacesYamlPath != null
      ? WorkspacesRepo.fromFile(opts.workspacesYamlPath)
      : new WorkspacesRepo("workspaces: []");

  const envReader = env as unknown as EnvReader;
  const { resolver, refresh } = await buildRefreshableSnapshotResolver({
    settings: stores.settingsStore,
    users: usersRepo,
    workspaces: workspacesRepo,
    env: envReader,
  });

  const clock = new SystemClock();
  const claude = buildClaudeAgentBackend({
    stores,
    resolver,
    clock,
    dataDir,
    ...(opts.spawnOverride ? { spawn: opts.spawnOverride } : {}),
  });

  const transport: TelegramTransport =
    opts.transportOverride ??
    new GrammyTelegramTransport({
      botFactory: realGrammyBotFactory(token),
      allowList,
    });

  const sendMessageToAgent = makeSendMessageToAgent({
    backend: claude.backend,
    telegram: transport,
    resolver,
    sessionStore: stores.sessionStore,
    historyStore: stores.historyStore,
    crashRecovery: claude.crashRecovery,
    locks: stores.lock,
    clock,
    resolveWorkspacePath: async (chatId) => {
      const p = await stores.workspaceHistoryStore.getCurrent(chatId);
      return p ?? dataDir;
    },
  });

  const resetSession = makeResetSession({
    backend: claude.backend,
    sessionStore: stores.sessionStore,
    locks: stores.lock,
  });
  const stopStream = makeStopStream({ aborts: claude.aborts });

  // ── Scheduler (Phase 8) ─────────────────────────────────────────────
  const scheduler = new LoopScheduler({ jobStore: stores.jobStore, clock });
  const runScheduledFire = makeRunScheduledFire({
    jobStore: stores.jobStore,
    transport,
    clock,
    scheduler,
    sendMessageToAgent: async (call) => {
      await sendMessageToAgent({ chatId: call.chatId, text: call.text });
      // No direct response text available — return an empty marker so the
      // CONDITION_MET scan never triggers unless a future refactor threads
      // the terminal assistant text back through the delegate. This matches
      // spec #45: absence of marker leaves the job running.
      return { text: "" };
    },
  });
  const cancelJob = makeCancelJob({ jobStore: stores.jobStore, scheduler });
  const updateSettings = makeUpdateUserSettings({
    settings: stores.settingsStore,
    refreshSnapshot: refresh,
  });

  // ── HTTP server (Phase 7) ───────────────────────────────────────────
  const adminChatId = allowList[0] ?? 0;
  const httpPort = Number(env.HTTP_PORT ?? 8080);
  const webhookServer = new HonoWebhookServer({
    githubSecret: env.GITHUB_WEBHOOK_SECRET,
    genericSecret: env.GENERIC_WEBHOOK_SECRET,
    apiSecret: env.GENERIC_WEBHOOK_SECRET,
    adminChatId,
    routeWebhookEvent: makeRouteWebhookEvent({ transport, adminChatId }),
    sendProactiveMessage: makeSendProactiveMessage({ transport, allowList }),
    scheduleJob: makeScheduleJob({ jobStore: stores.jobStore, scheduler }),
    jobStore: stores.jobStore,
    ...(opts.serviceProxy ? { serviceProxy: opts.serviceProxy } : {}),
  });

  const defaultWebhookStatus: WebhookStatusProvider = {
    snapshot: () => webhookServer.status().endpoints,
  };
  const webhookStatus = opts.webhookStatus ?? defaultWebhookStatus;

  const presenter = new TelegramPresenter({
    transport,
    aborts: claude.aborts,
    sessionStore: stores.sessionStore,
    sendMessageToAgent,
    resetSession,
    stopStream,
    setModel: async (chatId, model) => {
      await updateSettings.set(chatId, "model", model);
      await claude.backend.restart(chatId);
    },
    setSetting: async (chatId, field, value) => {
      await updateSettings.set(chatId, field as never, value);
    },
    resetSetting: async (chatId, field) => {
      await updateSettings.reset(chatId, field as never);
    },
    resolver,
    workspacePath: async (chatId) => {
      const p = await stores.workspaceHistoryStore.getCurrent(chatId);
      return p ?? dataDir;
    },
    webhookStatus,
    jobStore: stores.jobStore,
    cancelJob,
  });
  presenter.register();

  const restoreOnStart = makeRestoreOnStart({
    transport,
    crashRecovery: claude.crashRecovery,
    // Phase 8: scheduler starts (begins its timer loop) + loads all active
    // jobs; catch-up happens inside `start` via rehydrate.
    rehydrateScheduler: async () => {
      await scheduler.start(runScheduledFire);
    },
  });

  const startHttpServer = opts.startHttpServer ?? true;

  return {
    transport,
    resolver,
    webhookServer,
    shutdownBackend: () => claude.shutdown(),
    async start() {
      await restoreOnStart();
      await transport.start();
      if (startHttpServer) {
        await webhookServer.start(httpPort);
      }
    },
    async stop() {
      // Stop HTTP first so no late requests hit a torn-down backend.
      try {
        await webhookServer.stop();
      } finally {
        try {
          await scheduler.stop();
        } finally {
          try {
            await transport.stop();
          } finally {
            await claude.shutdown();
            stores.close();
          }
        }
      }
    },
  };
}

function parseAllowList(raw: string): number[] {
  if (raw.trim() === "") return [];
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
    .map((s) => {
      const n = Number(s);
      if (!Number.isInteger(n)) throw new Error(`invalid TELEGRAM_ALLOWED_IDS entry: ${s}`);
      return n;
    });
}

/**
 * Minimal bundled migration runner. Reads `migrations/*.sql` from the repo
 * and applies any not yet recorded in `_migrations`. Mirrors the script in
 * `scripts/migrate.ts` so `src/` never imports from `scripts/`.
 */
function applyBundledMigrations(db: LunaDb): string[] {
  const dir = join(process.cwd(), "migrations");
  const raw = db.$raw;
  raw.exec(
    `CREATE TABLE IF NOT EXISTS _migrations (name TEXT PRIMARY KEY, applied_at TEXT NOT NULL)`,
  );
  const files = readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .sort();
  const applied = new Set(
    (raw.prepare("SELECT name FROM _migrations").all() as Array<{ name: string }>).map(
      (r) => r.name,
    ),
  );
  const newlyApplied: string[] = [];
  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = readFileSync(join(dir, file), "utf8");
    const tx = raw.transaction(() => {
      raw.exec(sql);
      raw
        .prepare("INSERT INTO _migrations (name, applied_at) VALUES (?, ?)")
        .run(file, new Date().toISOString());
    });
    tx();
    newlyApplied.push(file);
  }
  return newlyApplied;
}
