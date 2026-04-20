import { describe, expect, it } from "bun:test";
import { FakeSettingsStore } from "../../helpers/fakes/fake-settings-store.ts";
import {
  makeUpdateUserSettings,
  SETTINGS_FIELD_KEYS,
  type SettingsField,
} from "../../../src/usecases/update-user-settings.ts";

describe("makeUpdateUserSettings", () => {
  it("writes model under the user_config:<chatId>:model key", async () => {
    const store = new FakeSettingsStore();
    const refreshes: number[] = [];
    const update = makeUpdateUserSettings({
      settings: store,
      refreshSnapshot: async (chatId) => {
        refreshes.push(chatId);
      },
    });

    await update.set(42, "model", "opus");

    expect(await store.get("user_config:42:model")).toBe("opus");
    expect(refreshes).toEqual([42]);
  });

  it("rejects unknown fields", async () => {
    const update = makeUpdateUserSettings({
      settings: new FakeSettingsStore(),
      refreshSnapshot: async () => {},
    });
    await expect(update.set(42, "nope" as SettingsField, "x")).rejects.toThrow(/unknown field/i);
  });

  it("rejects malformed model values", async () => {
    const update = makeUpdateUserSettings({
      settings: new FakeSettingsStore(),
      refreshSnapshot: async () => {},
    });
    await expect(update.set(42, "model", "bogus")).rejects.toThrow(/unknown model/i);
  });

  it("coerces numeric fields and rejects non-positive values", async () => {
    const store = new FakeSettingsStore();
    const update = makeUpdateUserSettings({
      settings: store,
      refreshSnapshot: async () => {},
    });
    await update.set(42, "timeoutSeconds", "600");
    expect(await store.get("user_config:42:timeout_s")).toBe("600");
    await expect(update.set(42, "timeoutSeconds", "0")).rejects.toThrow(/positive/i);
    await expect(update.set(42, "timeoutSeconds", "abc")).rejects.toThrow(/integer/i);
  });

  it("reset deletes the per-user key and refreshes the snapshot", async () => {
    const store = new FakeSettingsStore();
    const refreshes: number[] = [];
    await store.set("user_config:42:model", "opus");
    const update = makeUpdateUserSettings({
      settings: store,
      refreshSnapshot: async (c) => {
        refreshes.push(c);
      },
    });
    await update.reset(42, "model");
    expect(await store.get("user_config:42:model")).toBeNull();
    expect(refreshes).toEqual([42]);
  });

  it("exposes the list of accepted fields", () => {
    expect(new Set(Object.keys(SETTINGS_FIELD_KEYS))).toEqual(
      new Set(["model", "timeoutSeconds", "maxBudgetUsd", "contextWindow", "idleTimeoutMin"]),
    );
  });
});
