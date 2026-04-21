import type { AllowedWorkspaceStore } from "../../adapters/ports/allowed-workspace-store.port.ts";
import type { Workspace } from "../../entities/workspace.ts";
import type { LunaDb } from "./client.ts";

interface Row {
  chat_id: number;
  path: string;
  added_at: string;
  last_used_at: string | null;
}

/**
 * SQLite-backed allow-list of per-chat workspace paths. Composite primary key
 * (chat_id, path); `ws_by_chat` index powers list/has.
 */
export class SqliteAllowedWorkspaceStore implements AllowedWorkspaceStore {
  constructor(private readonly db: LunaDb) {}

  async list(chatId: number): Promise<Workspace[]> {
    const rows = this.db.$raw
      .prepare("SELECT * FROM workspaces WHERE chat_id = ? ORDER BY added_at")
      .all(chatId) as Row[];
    return rows.map((r) => this.toPort(r));
  }

  async has(chatId: number, path: string): Promise<boolean> {
    const row = this.db.$raw
      .prepare("SELECT 1 as one FROM workspaces WHERE chat_id = ? AND path = ?")
      .get(chatId, path) as { one: number } | undefined;
    return !!row;
  }

  async add(chatId: number, path: string, now: Date): Promise<void> {
    this.db.$raw
      .prepare(
        `INSERT INTO workspaces (chat_id, path, added_at, last_used_at)
         VALUES (?, ?, ?, NULL)
         ON CONFLICT(chat_id, path) DO NOTHING`,
      )
      .run(chatId, path, now.toISOString());
  }

  async remove(chatId: number, path: string): Promise<void> {
    this.db.$raw.prepare("DELETE FROM workspaces WHERE chat_id = ? AND path = ?").run(chatId, path);
  }

  async touch(chatId: number, path: string, now: Date): Promise<void> {
    this.db.$raw
      .prepare("UPDATE workspaces SET last_used_at = ? WHERE chat_id = ? AND path = ?")
      .run(now.toISOString(), chatId, path);
  }

  async listAll(): Promise<Workspace[]> {
    const rows = this.db.$raw.prepare("SELECT * FROM workspaces ORDER BY added_at").all() as Row[];
    return rows.map((r) => this.toPort(r));
  }

  private toPort(r: Row): Workspace {
    return {
      chatId: r.chat_id,
      path: r.path,
      addedAt: new Date(r.added_at),
      lastUsedAt: r.last_used_at ? new Date(r.last_used_at) : null,
    };
  }
}
