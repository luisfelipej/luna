import { describe, expect, test } from "bun:test";
import type { SettingsStore } from "../../src/adapters/ports/settings-store.port.ts";

export function settingsStoreContract(
  name: string,
  makeStore: () => Promise<SettingsStore> | SettingsStore,
): void {
  describe(`SettingsStore contract [${name}]`, () => {
    test("get returns null on miss", async () => {
      const s = await makeStore();
      expect(await s.get("x")).toBeNull();
    });

    test("set + get + idempotent overwrite", async () => {
      const s = await makeStore();
      await s.set("model:42", "opus");
      expect(await s.get("model:42")).toBe("opus");
      await s.set("model:42", "sonnet");
      expect(await s.get("model:42")).toBe("sonnet");
    });

    test("delete removes the key", async () => {
      const s = await makeStore();
      await s.set("k", "v");
      await s.delete("k");
      expect(await s.get("k")).toBeNull();
    });

    test("listPrefix returns only matching keys", async () => {
      const s = await makeStore();
      await s.set("ws_config:42:/p:timeout_s", "30");
      await s.set("ws_config:42:/p:model", "opus");
      await s.set("ws_config:43:/q:model", "sonnet");
      await s.set("model:42", "haiku");
      const entries = await s.listPrefix("ws_config:42:");
      const keys = entries.map((e) => e.key).sort();
      expect(keys).toEqual(["ws_config:42:/p:model", "ws_config:42:/p:timeout_s"]);
    });
  });
}
