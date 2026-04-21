import type { AllowedWorkspaceStore } from "../../../src/adapters/ports/allowed-workspace-store.port.ts";
import type { Workspace } from "../../../src/entities/workspace.ts";

export class FakeAllowedWorkspaceStore implements AllowedWorkspaceStore {
  private readonly rows = new Map<string, Workspace>(); // key = chatId:path

  private key(chatId: number, path: string): string {
    return `${chatId}:${path}`;
  }

  async list(chatId: number): Promise<Workspace[]> {
    return [...this.rows.values()].filter((w) => w.chatId === chatId);
  }
  async has(chatId: number, path: string): Promise<boolean> {
    return this.rows.has(this.key(chatId, path));
  }
  async add(chatId: number, path: string, now: Date): Promise<void> {
    this.rows.set(this.key(chatId, path), { chatId, path, addedAt: now, lastUsedAt: null });
  }
  async remove(chatId: number, path: string): Promise<void> {
    this.rows.delete(this.key(chatId, path));
  }
  async touch(chatId: number, path: string, now: Date): Promise<void> {
    const row = this.rows.get(this.key(chatId, path));
    if (!row) return;
    this.rows.set(this.key(chatId, path), { ...row, lastUsedAt: now });
  }

  async listAll(): Promise<Workspace[]> {
    return [...this.rows.values()];
  }
}
