import type { MessageLine } from "../../entities/message.ts";

/**
 * Append-only per-chat JSONL transcript. Rotated daily (UTC); `tail(n)` walks
 * backwards across daily files when needed.
 */
export interface HistoryStore {
  append(chatId: number, line: MessageLine): Promise<void>;
  tail(chatId: number, n: number): Promise<MessageLine[]>;
}
