import { describe, expect, it } from "bun:test";
import { BackendPool, type PooledBackend } from "../../../src/infra/backends/backend-pool.ts";
import { makeEvictIdleBackends } from "../../../src/usecases/evict-idle-backends.ts";
import { FakeLockPort } from "../../helpers/fakes/fake-lock-port.ts";
import { VirtualClock } from "../../helpers/virtual-clock.ts";

function makeFakeBackend(chatId: number, cwd: string): PooledBackend & { disposed: boolean } {
  const entry = {
    chatId,
    cwd,
    sessionId: null as string | null,
    inFlight: false,
    lastActivityMs: 0,
    disposed: false,
    async dispose() {
      this.disposed = true;
    },
  };
  return entry;
}

describe("BackendPool", () => {
  it("lazy-spawns on first ensure; reuses on second ensure with same cwd", async () => {
    const clock = new VirtualClock(1_000);
    const locks = new FakeLockPort();
    const spawned: Array<{ chatId: number; cwd: string }> = [];
    const pool = new BackendPool({
      clock,
      locks,
      idleTimeoutMs: 10_000,
      spawn: async (chatId, cwd) => {
        spawned.push({ chatId, cwd });
        return makeFakeBackend(chatId, cwd);
      },
    });
    const a = await pool.ensure(7, "/ws");
    const b = await pool.ensure(7, "/ws");
    expect(spawned.length).toBe(1);
    expect(a).toBe(b);
  });

  it("respawns when cwd changes", async () => {
    const clock = new VirtualClock(1_000);
    const locks = new FakeLockPort();
    const spawned: Array<{ chatId: number; cwd: string }> = [];
    const pool = new BackendPool({
      clock,
      locks,
      idleTimeoutMs: 10_000,
      spawn: async (chatId, cwd) => {
        spawned.push({ chatId, cwd });
        return makeFakeBackend(chatId, cwd);
      },
    });
    const first = (await pool.ensure(7, "/ws-a")) as ReturnType<typeof makeFakeBackend>;
    await pool.ensure(7, "/ws-b");
    expect(spawned).toEqual([
      { chatId: 7, cwd: "/ws-a" },
      { chatId: 7, cwd: "/ws-b" },
    ]);
    expect(first.disposed).toBe(true);
  });

  it("EvictIdleBackends removes idle not-in-flight entries via the pool's inspector surface", async () => {
    const clock = new VirtualClock(100_000);
    const locks = new FakeLockPort();
    const pool = new BackendPool({
      clock,
      locks,
      idleTimeoutMs: 30_000,
      spawn: async (chatId, cwd) => makeFakeBackend(chatId, cwd),
    });

    clock.setNow(50_000);
    await pool.ensure(1, "/ws"); // lastActivity = 50_000
    clock.setNow(100_000);

    const evict = makeEvictIdleBackends({ pool, clock, locks, idleTimeoutMs: 30_000 });
    const evicted = await evict();
    expect(evicted).toEqual([1]);
    expect(pool.get(1)).toBeUndefined();
  });

  it("does not evict entries that are in-flight", async () => {
    const clock = new VirtualClock(100_000);
    const locks = new FakeLockPort();
    const pool = new BackendPool({
      clock,
      locks,
      idleTimeoutMs: 30_000,
      spawn: async (chatId, cwd) => makeFakeBackend(chatId, cwd),
    });

    clock.setNow(50_000);
    await pool.ensure(1, "/ws");
    pool.markBusy(1);
    clock.setNow(100_000);

    const evict = makeEvictIdleBackends({ pool, clock, locks, idleTimeoutMs: 30_000 });
    expect(await evict()).toEqual([]);
    expect(pool.get(1)).toBeDefined();
  });

  it("shutdown disposes every entry", async () => {
    const clock = new VirtualClock(1);
    const pool = new BackendPool({
      clock,
      locks: new FakeLockPort(),
      idleTimeoutMs: 1,
      spawn: async (chatId, cwd) => makeFakeBackend(chatId, cwd),
    });
    const a = (await pool.ensure(1, "/x")) as ReturnType<typeof makeFakeBackend>;
    const b = (await pool.ensure(2, "/y")) as ReturnType<typeof makeFakeBackend>;
    await pool.shutdown();
    expect(a.disposed).toBe(true);
    expect(b.disposed).toBe(true);
    expect(pool.get(1)).toBeUndefined();
    expect(pool.get(2)).toBeUndefined();
  });
});
