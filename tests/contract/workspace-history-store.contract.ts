import { describe, expect, test } from "bun:test";
import type { WorkspaceHistoryStore } from "../../src/adapters/ports/workspace-history-store.port.ts";

export function workspaceHistoryStoreContract(
  name: string,
  makeStore: () => Promise<WorkspaceHistoryStore> | WorkspaceHistoryStore,
): void {
  describe(`WorkspaceHistoryStore contract [${name}]`, () => {
    test("initial getCurrent is null", async () => {
      const s = await makeStore();
      expect(await s.getCurrent(1)).toBeNull();
    });
    test("setCurrent persists", async () => {
      const s = await makeStore();
      await s.setCurrent(1, "/a");
      expect(await s.getCurrent(1)).toBe("/a");
      await s.setCurrent(1, "/b");
      expect(await s.getCurrent(1)).toBe("/b");
    });
  });
}
