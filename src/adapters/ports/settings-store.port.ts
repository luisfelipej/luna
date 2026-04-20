/**
 * Typed key-value settings store backed by a SQLite `settings` table.
 *
 * Keys use namespaced prefixes (e.g. `model:42`, `ws_config:42:/path:timeout_s`)
 * so `listPrefix(prefix)` can return all per-user / per-workspace overrides.
 */
export interface SettingsEntry {
  readonly key: string;
  readonly value: string;
}

export interface SettingsStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
  listPrefix(prefix: string): Promise<SettingsEntry[]>;
}
