import { join } from "node:path";
import type { AgentBackendPort } from "../adapters/ports/agent-backend.port.ts";
import type { ClockPort } from "../adapters/ports/clock.port.ts";
import type { ConfigResolverPort } from "../adapters/ports/config-resolver.port.ts";
import type { CrashRecoveryPort } from "../adapters/ports/crash-recovery.port.ts";
import type { LockPort } from "../adapters/ports/lock.port.ts";
import type { LoggerPort } from "../adapters/ports/logger.port.ts";
import type { WorkspaceHistoryStore } from "../adapters/ports/workspace-history-store.port.ts";
import { BackendPool, type PooledBackend } from "../infra/backends/backend-pool.ts";
import { ClaudeCodeBackend } from "../infra/backends/claude-code-backend.ts";
import { nodeSpawnPort } from "../infra/backends/node-spawn-port.ts";
import { PooledClaudeBackend } from "../infra/backends/pooled-claude-backend.ts";
import type { SpawnPort } from "../infra/backends/spawn-port.ts";
import { FsCrashRecoveryPort } from "../infra/fs/fs-crash-recovery-port.ts";
import { NodeFsPort } from "../infra/fs/node-fs-port.ts";
import { makeEvictIdleBackends } from "../usecases/evict-idle-backends.ts";
import type { StoresContainer } from "./container.ts";

export interface ClaudeBackendContainer {
  readonly backend: AgentBackendPort;
  readonly pool: BackendPool;
  readonly crashRecovery: CrashRecoveryPort;
  /**
   * Runs one idle-eviction sweep under the double-check pattern. Call on
   * a Clock-driven tick (LoopScheduler will drive it in Phase 8).
   */
  readonly tick: () => Promise<number[]>;
  /** Per-chat AbortController registry used by /stop. */
  readonly aborts: StreamAbortRegistry;
  shutdown(): Promise<void>;
}

/** Per-chat AbortController registry. Populated by the presenter at send-time. */
export class StreamAbortRegistry {
  private readonly map = new Map<number, AbortController>();
  register(chatId: number): AbortController {
    const ctrl = new AbortController();
    this.map.set(chatId, ctrl);
    return ctrl;
  }
  abort(chatId: number): boolean {
    const ctrl = this.map.get(chatId);
    if (!ctrl) return false;
    ctrl.abort();
    this.map.delete(chatId);
    return true;
  }
  clear(chatId: number): void {
    this.map.delete(chatId);
  }
  has(chatId: number): boolean {
    return this.map.has(chatId);
  }
}

export interface BuildClaudeBackendOptions {
  readonly stores: StoresContainer;
  readonly resolver: ConfigResolverPort;
  readonly clock: ClockPort;
  /** Data directory root for crash-flag files. */
  readonly dataDir: string;
  /** Idle eviction timeout (ms). Defaults to 15 minutes per design. */
  readonly idleTimeoutMs?: number;
  /** Override the spawn port (tests). */
  readonly spawn?: SpawnPort;
  /** Override the claude binary path. */
  readonly claudeBinary?: string;
  /** Extra args appended to every `claude` invocation (e.g. permission flags). */
  readonly extraClaudeArgs?: readonly string[];
  readonly logger?: LoggerPort;
  /**
   * Resolves the session id for `claude --resume <sid>` on each spawn.
   * Defaults to a SessionStore-backed lookup so multi-turn conversations
   * survive backend restarts (Phase 6 session-continuity wiring).
   */
  readonly resumeSessionId?: (chatId: number) => Promise<string | null>;
}

/**
 * Phase 5.12 composition: wires `BackendPool` + `ClaudeCodeBackend` +
 * `PooledClaudeBackend` + `FsCrashRecoveryPort` + abort registry + the
 * eviction walker into one cohesive unit consumed by the Telegram presenter
 * (Phase 6) and `RunScheduledFire` (Phase 8).
 *
 * By default uses the real `nodeSpawnPort` — callers can override via
 * `opts.spawn` for integration smoke tests that drive a FakeSpawn.
 */
export function buildClaudeAgentBackend(opts: BuildClaudeBackendOptions): ClaudeBackendContainer {
  const clock = opts.clock;
  const locks = opts.stores.lock;
  const idleTimeoutMs = opts.idleTimeoutMs ?? 15 * 60 * 1000;
  const spawn = opts.spawn ?? nodeSpawnPort;
  const claudeBinary = opts.claudeBinary ?? "claude";
  const extraClaudeArgs = opts.extraClaudeArgs ?? [];

  const resumeSessionId =
    opts.resumeSessionId ??
    (async (chatId: number): Promise<string | null> => {
      const row = await opts.stores.sessionStore.get(chatId);
      return row?.sessionId ?? null;
    });

  const pool = new BackendPool({
    clock,
    locks,
    idleTimeoutMs,
    spawn: async (chatId, cwd) =>
      createPooledEntry({
        chatId,
        cwd,
        clock,
        locks,
        logger: opts.logger,
        spawn,
        claudeBinary,
        extraClaudeArgs,
        sessionStore: opts.stores.sessionStore,
        resumeSessionId,
      }),
  });

  const resolveCwd = buildCwdResolver(opts.stores.workspaceHistoryStore);
  const pooledBackend = new PooledClaudeBackend({
    pool,
    locks,
    clock,
    resolveCwd,
    stream: (entry, text, cfg, signal) =>
      (entry as PooledClaudeEntry).backend.send(entry.chatId, text, cfg, signal),
  });

  const crashRecovery = new FsCrashRecoveryPort(new NodeFsPort(), opts.dataDir);

  const evict = makeEvictIdleBackends({ pool, clock, locks, idleTimeoutMs });

  return {
    backend: pooledBackend,
    pool,
    crashRecovery,
    aborts: new StreamAbortRegistry(),
    tick: evict,
    async shutdown() {
      await pool.shutdown();
    },
  };
}

/** Pool entry variant that carries the real ClaudeCodeBackend instance. */
interface PooledClaudeEntry extends PooledBackend {
  readonly backend: ClaudeCodeBackend;
}

function createPooledEntry(args: {
  chatId: number;
  cwd: string;
  clock: ClockPort;
  locks: LockPort;
  logger: LoggerPort | undefined;
  spawn: SpawnPort;
  claudeBinary: string;
  extraClaudeArgs: readonly string[];
  sessionStore: StoresContainer["sessionStore"];
  resumeSessionId: (chatId: number) => Promise<string | null>;
}): PooledClaudeEntry {
  const backend = new ClaudeCodeBackend({
    spawn: args.spawn,
    command: args.claudeBinary,
    cwd: args.cwd,
    extraArgs: args.extraClaudeArgs,
    ...(args.logger ? { logger: args.logger } : {}),
    resumeSessionId: args.resumeSessionId,
  });
  const entry: PooledClaudeEntry = {
    chatId: args.chatId,
    cwd: args.cwd,
    sessionId: null,
    inFlight: false,
    lastActivityMs: args.clock.nowMs(),
    backend,
    async dispose() {
      await backend.shutdown();
    },
  };
  return entry;
}

function buildCwdResolver(ws: WorkspaceHistoryStore): (chatId: number) => Promise<string> {
  return async (chatId: number) => {
    const path = await ws.getCurrent(chatId);
    return path ?? process.cwd();
  };
}

/** Data-dir resolver compatible with Phase 3's storesOptionsFromEnv shape. */
export function dataDirFromEnv(env: { DATA_DIR?: string }): string {
  return env.DATA_DIR ?? join(process.cwd(), "data");
}
