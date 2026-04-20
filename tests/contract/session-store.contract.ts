import { describe, expect, test } from "bun:test";
import type { SessionStore } from "../../src/adapters/ports/session-store.port.ts";

/**
 * Shared SessionStore contract suite. Parameterized over any factory
 * returning a fresh SessionStore — run against both FakeSessionStore and
 * SqliteSessionStore so both paths respect the same semantics.
 */
export function sessionStoreContract(
  name: string,
  makeStore: () => Promise<SessionStore> | SessionStore,
): void {
  describe(`SessionStore contract [${name}]`, () => {
    test("get returns null on miss", async () => {
      const s = await makeStore();
      expect(await s.get(1)).toBeNull();
    });

    test("upsert then get roundtrips", async () => {
      const s = await makeStore();
      const now = new Date("2025-01-01T00:00:00Z");
      await s.upsert({
        chatId: 1,
        sessionId: "sid-a",
        model: "sonnet",
        totalCostUsd: 0.5,
        lastUsedAt: now,
      });
      const row = await s.get(1);
      expect(row).not.toBeNull();
      expect(row?.sessionId).toBe("sid-a");
      expect(row?.model).toBe("sonnet");
      expect(row?.totalCostUsd).toBeCloseTo(0.5);
      expect(row?.lastUsedAt.toISOString()).toBe(now.toISOString());
    });

    test("upsert is idempotent (updates existing row)", async () => {
      const s = await makeStore();
      const t0 = new Date("2025-01-01T00:00:00Z");
      const t1 = new Date("2025-01-02T00:00:00Z");
      await s.upsert({
        chatId: 2,
        sessionId: "a",
        model: "opus",
        totalCostUsd: 1,
        lastUsedAt: t0,
      });
      await s.upsert({
        chatId: 2,
        sessionId: "b",
        model: "haiku",
        totalCostUsd: 2,
        lastUsedAt: t1,
      });
      const row = await s.get(2);
      expect(row?.sessionId).toBe("b");
      expect(row?.model).toBe("haiku");
      expect(row?.totalCostUsd).toBe(2);
    });

    test("addCost accumulates", async () => {
      const s = await makeStore();
      const t0 = new Date("2025-01-01T00:00:00Z");
      await s.upsert({
        chatId: 3,
        sessionId: "sid",
        model: "sonnet",
        totalCostUsd: 1,
        lastUsedAt: t0,
      });
      await s.addCost(3, 0.25);
      await s.addCost(3, 0.75);
      const row = await s.get(3);
      expect(row?.totalCostUsd).toBeCloseTo(2);
    });

    test("clear removes the row", async () => {
      const s = await makeStore();
      const t0 = new Date("2025-01-01T00:00:00Z");
      await s.upsert({
        chatId: 4,
        sessionId: null,
        model: "sonnet",
        totalCostUsd: 0,
        lastUsedAt: t0,
      });
      await s.clear(4);
      expect(await s.get(4)).toBeNull();
    });
  });
}
