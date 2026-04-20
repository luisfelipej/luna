import type { ClockPort } from "../../adapters/ports/clock.port.ts";
import type { LockPort } from "../../adapters/ports/lock.port.ts";
import type { LoggerPort } from "../../adapters/ports/logger.port.ts";

/**
 * Minimal shape the pool exposes to whoever holds the eviction walker.
 * Mirrors `usecases/evict-idle-backends.PoolInspector` structurally so the
 * composition root can bind them without importing across layers.
 */
export interface PoolEntrySnapshot {
  readonly chatId: number;
  readonly lastActivityMs: number;
  readonly inFlight: boolean;
}

/**
 * One live entry in the pool. `cwd` is the workspace the backend was spawned
 * for; changing `cwd` forces a respawn.
 */
export interface PooledBackend {
  readonly chatId: number;
  cwd: string;
  sessionId: string | null;
  inFlight: boolean;
  lastActivityMs: number;
  dispose(): Promise<void>;
}

export interface BackendPoolDeps {
  readonly clock: ClockPort;
  readonly locks: LockPort;
  readonly idleTimeoutMs: number;
  readonly logger?: LoggerPort;
  /**
   * Factory that produces a fresh PooledBackend for a given (chatId, cwd).
   * Called under the per-chat lock; must resolve to a ready backend or
   * throw a `BackendError` the pool lets propagate.
   */
  readonly spawn: (chatId: number, cwd: string) => Promise<PooledBackend>;
}

/**
 * Per-chat backend pool with idle eviction.
 *
 * Responsibilities:
 * 1. `ensure(chatId, cwd)` returns a live backend for the chat; respawns if
 *    the current cwd differs from the request.
 * 2. `markBusy` / `markIdle` / `stampActivity` drive the accounting used by
 *    the eviction walker.
 * 3. `tick()` calls `EvictIdleBackends` under `LockPort.tryWithLock` with
 *    the double-check pattern.
 * 4. `shutdown()` disposes everything under each chat's lock.
 *
 * See sdd/luna/design "Backend Pool + Eviction".
 */
export class BackendPool {
  private readonly entries = new Map<number, PooledBackend>();

  constructor(private readonly deps: BackendPoolDeps) {}

  /**
   * Returns the pooled backend for `chatId`. Spawns a fresh one if none
   * exists, or if the cached one was bound to a different cwd. Callers run
   * inside `locks.withLock(chatId, ...)` — `ensure` does NOT take the lock
   * itself (to avoid re-entry) but documents that contract.
   */
  async ensure(chatId: number, cwd: string): Promise<PooledBackend> {
    const existing = this.entries.get(chatId);
    if (existing && existing.cwd === cwd) {
      existing.lastActivityMs = this.deps.clock.nowMs();
      return existing;
    }
    if (existing) {
      await existing.dispose();
      this.entries.delete(chatId);
    }
    const fresh = await this.deps.spawn(chatId, cwd);
    fresh.lastActivityMs = this.deps.clock.nowMs();
    this.entries.set(chatId, fresh);
    return fresh;
  }

  markBusy(chatId: number): void {
    const e = this.entries.get(chatId);
    if (!e) return;
    e.inFlight = true;
    e.lastActivityMs = this.deps.clock.nowMs();
  }

  markIdle(chatId: number): void {
    const e = this.entries.get(chatId);
    if (!e) return;
    e.inFlight = false;
    e.lastActivityMs = this.deps.clock.nowMs();
  }

  stampActivity(chatId: number): void {
    const e = this.entries.get(chatId);
    if (!e) return;
    e.lastActivityMs = this.deps.clock.nowMs();
  }

  async kill(chatId: number): Promise<void> {
    const e = this.entries.get(chatId);
    if (!e) return;
    await e.dispose();
    this.entries.delete(chatId);
  }

  async shutdown(): Promise<void> {
    const ids = [...this.entries.keys()];
    for (const id of ids) {
      await this.deps.locks.withLock(id, async () => {
        const cur = this.entries.get(id);
        if (!cur) return;
        await cur.dispose();
        this.entries.delete(id);
      });
    }
  }

  // ── PoolInspector ─────────────────────────────────────────────────────
  snapshot(): readonly PoolEntrySnapshot[] {
    return [...this.entries.values()].map((e) => ({
      chatId: e.chatId,
      lastActivityMs: e.lastActivityMs,
      inFlight: e.inFlight,
    }));
  }

  peek(chatId: number): PoolEntrySnapshot | null {
    const e = this.entries.get(chatId);
    if (!e) return null;
    return { chatId: e.chatId, lastActivityMs: e.lastActivityMs, inFlight: e.inFlight };
  }

  async dispose(chatId: number): Promise<void> {
    await this.kill(chatId);
  }

  /** Exposed for tests + the pooled AgentBackendPort adapter. */
  get(chatId: number): PooledBackend | undefined {
    return this.entries.get(chatId);
  }
}
