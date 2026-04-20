import { describe, expect, test } from "bun:test";
import type { LockPort } from "../../src/adapters/ports/lock.port.ts";
import { AsyncMutexLockPort } from "../../src/infra/locks/async-mutex-lock-port.ts";
import { FakeLockPort } from "../helpers/fakes/fake-lock-port.ts";

function lockPortContract(name: string, make: () => LockPort): void {
  describe(`LockPort contract [${name}]`, () => {
    test("serializes same-chat withLock", async () => {
      const lock = make();
      const order: string[] = [];
      const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));
      const a = lock.withLock(1, async () => {
        order.push("a-start");
        await delay(30);
        order.push("a-end");
      });
      const b = lock.withLock(1, async () => {
        order.push("b-start");
        await delay(5);
        order.push("b-end");
      });
      await Promise.all([a, b]);
      expect(order).toEqual(["a-start", "a-end", "b-start", "b-end"]);
    });

    test("different chats run concurrently", async () => {
      const lock = make();
      const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));
      let inFlight = 0;
      let peak = 0;
      const task = async () => {
        inFlight += 1;
        peak = Math.max(peak, inFlight);
        await delay(20);
        inFlight -= 1;
      };
      await Promise.all([lock.withLock(1, task), lock.withLock(2, task), lock.withLock(3, task)]);
      expect(peak).toBeGreaterThanOrEqual(2);
    });

    test("tryWithLock returns null when held", async () => {
      const lock = make();
      const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));
      const busy = lock.withLock(4, async () => delay(30));
      await delay(5);
      const skipped = await lock.tryWithLock(4, async () => "ran");
      expect(skipped).toBeNull();
      await busy;
    });
  });
}

lockPortContract("fake", () => new FakeLockPort());
lockPortContract("async-mutex", () => new AsyncMutexLockPort());
