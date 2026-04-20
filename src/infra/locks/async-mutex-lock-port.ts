import { Mutex } from "async-mutex";
import type { LockPort } from "../../adapters/ports/lock.port.ts";

/**
 * Per-chat mutex backed by `async-mutex`. Serializes `withLock` for the same
 * chat id while allowing different chats to run concurrently.
 *
 * `tryWithLock` returns `null` without waiting if the lock is currently held
 * — used by the idle-eviction tick so the scheduler skips busy chats rather
 * than queueing behind them.
 */
export class AsyncMutexLockPort implements LockPort {
  private readonly mutexes = new Map<number, Mutex>();

  private mutexFor(chatId: number): Mutex {
    let m = this.mutexes.get(chatId);
    if (!m) {
      m = new Mutex();
      this.mutexes.set(chatId, m);
    }
    return m;
  }

  async withLock<T>(chatId: number, fn: () => Promise<T>): Promise<T> {
    return this.mutexFor(chatId).runExclusive(fn);
  }

  async tryWithLock<T>(chatId: number, fn: () => Promise<T>): Promise<T | null> {
    const m = this.mutexFor(chatId);
    if (m.isLocked()) return null;
    return m.runExclusive(fn);
  }
}
