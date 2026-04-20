/**
 * Parsed inbound Telegram update — what the TelegramTransport hands to the
 * presenter. Only carries the fields Luna actually uses.
 */
export interface TelegramUpdate {
  readonly chatId: number;
  readonly fromId: number;
  readonly messageId: number;
  /** Present for text messages and command messages. */
  readonly text?: string;
  /** If the user sent a photo/document/etc. */
  readonly media?: {
    readonly kind: "photo" | "document" | "voice" | "video" | "other";
    readonly fileId: string;
    readonly caption?: string;
    readonly mimeType?: string;
  };
  readonly dateMs: number;
}
