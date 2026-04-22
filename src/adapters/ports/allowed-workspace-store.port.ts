import type { Workspace } from "../../entities/workspace.ts";

/**
 * Allow-list of known-good workspace paths per chat. Rows live in the
 * `workspaces` SQLite table. SwitchWorkspace only permits paths present here.
 */
export interface AllowedWorkspaceStore {
  list(chatId: number): Promise<Workspace[]>;
  has(chatId: number, path: string): Promise<boolean>;
  add(chatId: number, path: string, now: Date): Promise<void>;
  remove(chatId: number, path: string): Promise<void>;
  touch(chatId: number, path: string, now: Date): Promise<void>;
  /** Returns all workspace rows across all chat IDs. Used by GET /api/workspaces. */
  listAll(): Promise<Workspace[]>;
}
