import { describe, expect, test } from "bun:test";
import type { AllowedWorkspaceStore } from "../../src/adapters/ports/allowed-workspace-store.port.ts";

export function allowedWorkspaceStoreContract(
  name: string,
  makeStore: () => Promise<AllowedWorkspaceStore> | AllowedWorkspaceStore,
): void {
  describe(`AllowedWorkspaceStore contract [${name}]`, () => {
    test("add + has + list", async () => {
      const s = await makeStore();
      const now = new Date("2025-01-01T00:00:00Z");
      await s.add(1, "/w/a", now);
      await s.add(1, "/w/b", now);
      await s.add(2, "/w/c", now);
      expect(await s.has(1, "/w/a")).toBe(true);
      expect(await s.has(1, "/w/z")).toBe(false);
      const list1 = await s.list(1);
      expect(list1.map((w) => w.path).sort()).toEqual(["/w/a", "/w/b"]);
    });

    test("touch updates lastUsedAt", async () => {
      const s = await makeStore();
      const now = new Date("2025-01-01T00:00:00Z");
      const later = new Date("2025-01-02T00:00:00Z");
      await s.add(3, "/w/x", now);
      await s.touch(3, "/w/x", later);
      const [row] = await s.list(3);
      expect(row?.lastUsedAt?.toISOString()).toBe(later.toISOString());
    });

    test("remove drops the row", async () => {
      const s = await makeStore();
      const now = new Date("2025-01-01T00:00:00Z");
      await s.add(4, "/w/y", now);
      await s.remove(4, "/w/y");
      expect(await s.has(4, "/w/y")).toBe(false);
    });

    test("add is idempotent", async () => {
      const s = await makeStore();
      const now = new Date("2025-01-01T00:00:00Z");
      await s.add(5, "/w/z", now);
      await s.add(5, "/w/z", now);
      const rows = await s.list(5);
      expect(rows).toHaveLength(1);
    });

    test("listAll() returns all rows across all chat IDs", async () => {
      const s = await makeStore();
      const now = new Date("2025-01-01T00:00:00Z");
      await s.add(10, "/w/alpha", now);
      await s.add(20, "/w/beta", now);
      await s.add(10, "/w/gamma", now);
      const all = await s.listAll();
      const paths = all.map((w) => w.path).sort();
      expect(paths).toEqual(["/w/alpha", "/w/beta", "/w/gamma"].sort());
    });
  });
}
