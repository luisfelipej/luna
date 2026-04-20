import type { SettingsEntry, SettingsStore } from "../../adapters/ports/settings-store.port.ts";
import type { LunaDb } from "./client.ts";

/**
 * SQLite-backed SettingsStore. Keys use namespaced prefixes (`model:42`,
 * `ws_config:42:/path:timeout_s`) so `listPrefix()` uses a LIKE with
 * escaped `%` / `_` to return all per-user / per-workspace overrides.
 */
export class SqliteSettingsStore implements SettingsStore {
  constructor(private readonly db: LunaDb) {}

  async get(key: string): Promise<string | null> {
    const row = this.db.$raw.prepare("SELECT value FROM settings WHERE key = ?").get(key) as
      | { value: string }
      | undefined;
    return row?.value ?? null;
  }

  async set(key: string, value: string): Promise<void> {
    this.db.$raw
      .prepare(
        `INSERT INTO settings (key, value) VALUES (?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      )
      .run(key, value);
  }

  async delete(key: string): Promise<void> {
    this.db.$raw.prepare("DELETE FROM settings WHERE key = ?").run(key);
  }

  async listPrefix(prefix: string): Promise<SettingsEntry[]> {
    // Escape LIKE wildcards in the prefix.
    const escaped = prefix.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
    const rows = this.db.$raw
      .prepare("SELECT key, value FROM settings WHERE key LIKE ? ESCAPE '\\' ORDER BY key")
      .all(`${escaped}%`) as Array<{ key: string; value: string }>;
    return rows;
  }
}
