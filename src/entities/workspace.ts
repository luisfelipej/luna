/**
 * An allow-listed working directory for a given Telegram chat. Rows live in
 * the `workspaces` SQLite table; the SwitchWorkspace use case enforces
 * realpath confinement under `WORKSPACE_BASE`.
 */
export interface Workspace {
  readonly chatId: number;
  readonly path: string;
  readonly addedAt: Date;
  /** When the user last `/workspace`-switched to this one. Null = never. */
  readonly lastUsedAt: Date | null;
}
