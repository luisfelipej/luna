import type { LockPort } from "../../../src/adapters/ports/lock.port.ts";

/** In-process LockPort fake — uses a per-chat promise chain for ordering. */
export class FakeLockPort implements LockPort {
  private readonly chains = new Map<number, Promise<unknown>>();

  async withLock<T>(chatId: number, fn: () => Promise<T>): Promise<T> {
    const prev = this.chains.get(chatId) ?? Promise.resolve();
    const next = prev.then(() => fn());
    this.chains.set(
      chatId,
      next.catch(() => undefined),
    );
    return next;
  }

  async tryWithLock<T>(chatId: number, fn: () => Promise<T>): Promise<T | null> {
    if (this.chains.has(chatId)) return null;
    const p = fn();
    this.chains.set(
      chatId,
      p.catch(() => undefined).finally(() => this.chains.delete(chatId)),
    );
    return p;
  }
}
