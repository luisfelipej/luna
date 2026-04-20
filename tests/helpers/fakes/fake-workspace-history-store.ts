import type { WorkspaceHistoryStore } from "../../../src/adapters/ports/workspace-history-store.port.ts";

export class FakeWorkspaceHistoryStore implements WorkspaceHistoryStore {
  private readonly current = new Map<number, string>();

  async getCurrent(chatId: number): Promise<string | null> {
    return this.current.get(chatId) ?? null;
  }
  async setCurrent(chatId: number, path: string): Promise<void> {
    this.current.set(chatId, path);
  }
}
