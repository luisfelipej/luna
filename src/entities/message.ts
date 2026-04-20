/**
 * A single line of a chat transcript, persisted to the per-chat JSONL history
 * file. `dir` records who emitted the line; optional `media` carries
 * attachments the user sent (agent replies are always pure text in M1).
 */
export type MessageDirection = "user" | "assistant";

export interface MessageMedia {
  readonly kind: "photo" | "document" | "voice" | "video" | "other";
  /** Telegram file_id or local path, depending on context. */
  readonly ref: string;
  readonly caption?: string;
  readonly mimeType?: string;
}

export interface MessageLine {
  readonly chatId: number;
  readonly text: string;
  readonly dir: MessageDirection;
  /** ISO-8601 timestamp. */
  readonly ts: string;
  readonly media?: MessageMedia;
}
