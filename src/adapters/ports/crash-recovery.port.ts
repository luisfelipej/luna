/**
 * Per-chat "an agent response was interrupted" flag. Marked at the first
 * stream chunk, cleared on completion. `listPending()` at boot drives the
 * RestoreOnStart flow that tells users "Previous response was interrupted."
 */
export interface CrashRecoveryPort {
  mark(chatId: number): Promise<void>;
  clear(chatId: number): Promise<void>;
  listPending(): Promise<number[]>;
}
