import type { TelegramUpdate } from "../../entities/telegram-update.ts";

export interface SendMessageOpts {
  readonly markdown?: boolean;
}

export interface EditMessageOpts {
  readonly markdown?: boolean;
}

export type TelegramUpdateHandler = (update: TelegramUpdate) => Promise<void>;

/**
 * Streaming-capable Telegram transport.
 *
 * `sendMessage` returns the Telegram message_id so callers can later
 * `editMessage` that same bubble — this is the primitive StreamEventThrottle
 * uses to paint the leading-edge and trailing-edge updates.
 */
export interface TelegramTransport {
  sendMessage(chatId: number, text: string, opts?: SendMessageOpts): Promise<number>;
  editMessage(
    chatId: number,
    messageId: number,
    text: string,
    opts?: EditMessageOpts,
  ): Promise<void>;
  sendFile(chatId: number, path: string, caption?: string): Promise<void>;
  onUpdate(handler: TelegramUpdateHandler): void;
  start(): Promise<void>;
  stop(): Promise<void>;
}
