/**
 * Most-recently-used workspace per chat. Powers `/workspace` (no args) = show
 * current, and the scheduler's "where did that chat last live" lookup.
 */
export interface WorkspaceHistoryStore {
  getCurrent(chatId: number): Promise<string | null>;
  setCurrent(chatId: number, path: string): Promise<void>;
}
