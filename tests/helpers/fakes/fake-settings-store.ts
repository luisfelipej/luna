import type {
  SettingsEntry,
  SettingsStore,
} from "../../../src/adapters/ports/settings-store.port.ts";

export class FakeSettingsStore implements SettingsStore {
  private readonly rows = new Map<string, string>();

  async get(key: string): Promise<string | null> {
    return this.rows.get(key) ?? null;
  }
  async set(key: string, value: string): Promise<void> {
    this.rows.set(key, value);
  }
  async delete(key: string): Promise<void> {
    this.rows.delete(key);
  }
  async listPrefix(prefix: string): Promise<SettingsEntry[]> {
    return [...this.rows.entries()]
      .filter(([k]) => k.startsWith(prefix))
      .map(([key, value]) => ({ key, value }));
  }
}
