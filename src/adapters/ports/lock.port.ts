/**
 * Per-chat mutex. Serializes spawn/evict/send for a given chat id while
 * letting different chats run in parallel.
 *
 * `tryWithLock` returns `null` if the lock is currently held; callers use it
 * for best-effort work that should skip rather than queue (e.g. the idle
 * eviction tick).
 */
export interface LockPort {
  withLock<T>(chatId: number, fn: () => Promise<T>): Promise<T>;
  tryWithLock<T>(chatId: number, fn: () => Promise<T>): Promise<T | null>;
}
