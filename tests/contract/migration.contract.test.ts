import { describe, expect, test } from "bun:test";
import { applyMigrations } from "../../scripts/migrate.ts";
import { openDb } from "../../src/infra/db/client.ts";

describe("Migration contract", () => {
  test("0001_init creates all 5 tables + required indexes", async () => {
    const db = openDb(":memory:");
    await applyMigrations(db);
    const raw = db.$raw;

    const tables = raw
      .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
      .all() as Array<{ name: string }>;
    const names = tables.map((r) => r.name);
    for (const t of ["users", "workspaces", "sessions", "jobs", "settings"]) {
      expect(names).toContain(t);
    }

    const indexes = raw
      .prepare("SELECT name FROM sqlite_master WHERE type='index'")
      .all() as Array<{ name: string }>;
    const idxNames = indexes.map((r) => r.name);
    expect(idxNames).toContain("ws_by_chat");
    expect(idxNames).toContain("jobs_by_chat_active");

    // Busy timeout pragma is applied
    const btRow = raw.prepare("PRAGMA busy_timeout").get() as { timeout: number };
    expect(btRow.timeout).toBe(5000);

    raw.close();
  });

  test("migrate is idempotent (second run is a no-op)", async () => {
    const db = openDb(":memory:");
    await applyMigrations(db);
    await applyMigrations(db);
    const row = db.$raw
      .prepare("SELECT count(*) as c FROM sqlite_master WHERE type='table' AND name='settings'")
      .get() as { c: number };
    expect(row.c).toBe(1);
    db.$raw.close();
  });
});
