import { describe, expect, it } from "bun:test";
import {
  makeEvictIdleBackends,
  type PoolEntrySnapshot,
  type PoolInspector,
} from "../../../src/usecases/evict-idle-backends.ts";
import { FakeLockPort } from "../../helpers/fakes/fake-lock-port.ts";
import { VirtualClock } from "../../helpers/virtual-clock.ts";

class FakePool implements PoolInspector {
  readonly entries = new Map<number, PoolEntrySnapshot>();
  readonly disposed: number[] = [];

  snapshot(): readonly PoolEntrySnapshot[] {
    return [...this.entries.values()];
  }
  peek(chatId: number): PoolEntrySnapshot | null {
    return this.entries.get(chatId) ?? null;
  }
  async dispose(chatId: number): Promise<void> {
    this.disposed.push(chatId);
    this.entries.delete(chatId);
  }

  put(e: PoolEntrySnapshot): void {
    this.entries.set(e.chatId, e);
  }
}

describe("EvictIdleBackends", () => {
  it("evicts idle + not-in-flight entries whose activity is older than the cutoff", async () => {
    const clock = new VirtualClock(100_000);
    const pool = new FakePool();
    pool.put({ chatId: 1, lastActivityMs: 50_000, inFlight: false });
    pool.put({ chatId: 2, lastActivityMs: 99_000, inFlight: false }); // too recent
    pool.put({ chatId: 3, lastActivityMs: 50_000, inFlight: true }); // busy

    const evict = makeEvictIdleBackends({
      pool,
      clock,
      locks: new FakeLockPort(),
      idleTimeoutMs: 30_000,
    });
    const evicted = await evict();
    expect(evicted).toEqual([1]);
    expect(pool.disposed).toEqual([1]);
    expect(pool.entries.has(2)).toBe(true);
    expect(pool.entries.has(3)).toBe(true);
  });

  it("skips entries whose lastActivity changes between outside scan and inside peek (race)", async () => {
    const clock = new VirtualClock(100_000);
    const pool = new FakePool();
    pool.put({ chatId: 1, lastActivityMs: 50_000, inFlight: false });

    const racingLocks = new FakeLockPort();
    // Wrap tryWithLock so the entry's lastActivity shifts while we are "inside".
    const orig = racingLocks.tryWithLock.bind(racingLocks);
    racingLocks.tryWithLock = async <T>(chatId: number, fn: () => Promise<T>) => {
      pool.put({ chatId: 1, lastActivityMs: 99_999, inFlight: false });
      return orig(chatId, fn);
    };

    const evict = makeEvictIdleBackends({
      pool,
      clock,
      locks: racingLocks,
      idleTimeoutMs: 30_000,
    });
    const evicted = await evict();
    expect(evicted).toEqual([]);
    expect(pool.disposed).toEqual([]);
  });

  it("uses tryWithLock (best-effort) so a held lock does not block the tick", async () => {
    const clock = new VirtualClock(100_000);
    const pool = new FakePool();
    pool.put({ chatId: 1, lastActivityMs: 50_000, inFlight: false });

    const locks = new FakeLockPort();
    // Hold the chat-1 lock for the duration of the eviction call.
    let release: () => void = () => {};
    const held = new Promise<void>((res) => {
      release = res;
    });
    void locks.withLock(1, () => held);

    const evict = makeEvictIdleBackends({
      pool,
      clock,
      locks,
      idleTimeoutMs: 30_000,
    });
    const evicted = await evict();
    expect(evicted).toEqual([]);
    release();
  });

  it("returns [] when nothing is eligible", async () => {
    const clock = new VirtualClock(1_000);
    const pool = new FakePool();
    const evict = makeEvictIdleBackends({
      pool,
      clock,
      locks: new FakeLockPort(),
      idleTimeoutMs: 30_000,
    });
    expect(await evict()).toEqual([]);
  });
});
