import { describe, expect, test } from "bun:test";
import { applyMigrations } from "../../../scripts/migrate.ts";
import { buildStoresContainer, storesOptionsFromEnv } from "../../../src/composition/container.ts";

describe("buildStoresContainer", () => {
  test("wires real sqlite stores and SessionStore CRUD round-trips through container", async () => {
    const c = buildStoresContainer({ dbUrl: ":memory:", historyDir: "/tmp/luna-h" });
    await applyMigrations(c.db);
    await c.sessionStore.upsert({
      chatId: 7,
      sessionId: "sid",
      model: "sonnet",
      totalCostUsd: 0.1,
      lastUsedAt: new Date("2025-01-01T00:00:00Z"),
    });
    const row = await c.sessionStore.get(7);
    expect(row?.sessionId).toBe("sid");
    c.close();
  });

  test("storesOptionsFromEnv picks LUNA_DB_URL over DATA_DIR", () => {
    const a = storesOptionsFromEnv({ DATA_DIR: "/var/luna" });
    expect(a.dbUrl).toBe("/var/luna/luna.db");
    const b = storesOptionsFromEnv({ DATA_DIR: "/var/luna", LUNA_DB_URL: ":memory:" });
    expect(b.dbUrl).toBe(":memory:");
  });
});
