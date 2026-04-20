import type { ClockPort } from "../adapters/ports/clock.port.ts";
import type { LockPort } from "../adapters/ports/lock.port.ts";

/**
 * Snapshot of one pool entry the eviction walker inspects. Kept minimal so
 * the usecase does not leak the Node subprocess type.
 */
export interface PoolEntrySnapshot {
  readonly chatId: number;
  readonly lastActivityMs: number;
  readonly inFlight: boolean;
}

/**
 * Port the usecase calls to talk to a BackendPool without importing infra.
 *
 * The double-check eviction dance requires two peeks — one outside the lock
 * (cheap scan) and one inside (authoritative). Both live behind this
 * interface.
 */
export interface PoolInspector {
  /** Cheap snapshot of every pool entry. Used by the outer scan. */
  snapshot(): readonly PoolEntrySnapshot[];
  /**
   * Authoritative peek under the caller's lock context. Returns `null` if
   * the entry is gone; the walker also checks `inFlight` and compares
   * `lastActivityMs` to the value it observed outside the lock.
   */
  peek(chatId: number): PoolEntrySnapshot | null;
  /** Dispose the entry + remove it from the pool. Called under the lock. */
  dispose(chatId: number): Promise<void>;
}

export interface EvictIdleBackendsDeps {
  readonly pool: PoolInspector;
  readonly clock: ClockPort;
  readonly locks: LockPort;
  readonly idleTimeoutMs: number;
}

/**
 * Sweeps the pool once, evicting backends whose `lastActivity` is older than
 * `idleTimeoutMs` AND whose `inFlight` is false.
 *
 * Double-check pattern — verbatim port of Kai's invariant:
 * 1. Outer scan observes `(lastActivity, inFlight)` without a lock.
 * 2. For each candidate, acquire the chat's lock.
 * 3. Re-peek. If the entry disappeared, advanced its activity, or is now
 *    in-flight → skip. Only if everything still matches do we dispose.
 *
 * Uses `tryWithLock` so a pool tick never queues behind an active send;
 * eviction is best-effort and will retry on the next tick.
 */
export function makeEvictIdleBackends(deps: EvictIdleBackendsDeps) {
  return async function evictIdleBackends(): Promise<number[]> {
    const now = deps.clock.nowMs();
    const cutoff = now - deps.idleTimeoutMs;
    const evicted: number[] = [];

    for (const entry of deps.pool.snapshot()) {
      if (entry.inFlight) continue;
      if (entry.lastActivityMs > cutoff) continue;

      const outsideSeen = entry.lastActivityMs;
      const res = await deps.locks.tryWithLock(entry.chatId, async () => {
        const cur = deps.pool.peek(entry.chatId);
        if (!cur) return false;
        if (cur.inFlight) return false;
        if (cur.lastActivityMs !== outsideSeen) return false;
        if (cur.lastActivityMs > cutoff) return false;
        await deps.pool.dispose(entry.chatId);
        return true;
      });
      if (res === true) evicted.push(entry.chatId);
    }
    return evicted;
  };
}

export type EvictIdleBackends = ReturnType<typeof makeEvictIdleBackends>;
