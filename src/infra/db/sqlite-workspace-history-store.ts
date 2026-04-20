import type { WorkspaceHistoryStore } from "../../adapters/ports/workspace-history-store.port.ts";
import { SqliteSettingsStore } from "./sqlite-settings-store.ts";
import type { LunaDb } from "./client.ts";

/**
 * Most-recently-used workspace per chat. Persisted under the settings key
 * `ws_current:<chatId>` so we don't need a dedicated table for a one-value
 * relation.
 */
export class SqliteWorkspaceHistoryStore implements WorkspaceHistoryStore {
  private readonly settings: SqliteSettingsStore;
  constructor(db: LunaDb) {
    this.settings = new SqliteSettingsStore(db);
  }
  async getCurrent(chatId: number): Promise<string | null> {
    return this.settings.get(`ws_current:${chatId}`);
  }
  async setCurrent(chatId: number, path: string): Promise<void> {
    await this.settings.set(`ws_current:${chatId}`, path);
  }
}
