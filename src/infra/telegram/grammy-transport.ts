import { Bot } from "grammy";
import type {
  EditMessageOpts,
  SendMessageOpts,
  TelegramTransport,
  TelegramUpdateHandler,
} from "../../adapters/ports/telegram-transport.port.ts";

/** Shape of the update passed to `on("message:text", ...)` handlers. */
export interface GrammyMessageTextCtx {
  message: {
    message_id: number;
    text: string;
    chat: { id: number };
    from: { id: number };
    date: number;
  };
}

/**
 * Structural type over the slice of the grammY Bot API Luna uses. Keeping
 * this local lets tests inject a fake bot without instantiating grammY.
 */
export interface GrammyLikeBot {
  api: {
    sendMessage(
      chatId: number,
      text: string,
      other?: { parse_mode?: string },
    ): Promise<{ message_id: number }>;
    editMessageText(
      chatId: number,
      messageId: number,
      text: string,
      other?: { parse_mode?: string },
    ): Promise<unknown>;
    sendDocument(chatId: number, doc: unknown, other?: { caption?: string }): Promise<unknown>;
    deleteWebhook(opts: { drop_pending_updates: boolean }): Promise<unknown>;
  };
  on(event: "message:text", handler: (ctx: GrammyMessageTextCtx) => Promise<void> | void): void;
  start(): Promise<void>;
  stop(): Promise<void>;
}

export interface GrammyTelegramTransportOptions {
  /** Factory that builds the underlying bot. Allows tests to inject a fake. */
  botFactory: () => GrammyLikeBot;
  /** Telegram user IDs allowed to talk to the bot. Empty = allow none. */
  allowList: readonly number[];
}

/**
 * grammY-backed TelegramTransport. Filters inbound updates by allow-list;
 * outbound calls return the new message_id so StreamEventThrottle can edit.
 */
export class GrammyTelegramTransport implements TelegramTransport {
  private readonly bot: GrammyLikeBot;
  private readonly allowed: ReadonlySet<number>;
  private handler: TelegramUpdateHandler | null = null;

  constructor(opts: GrammyTelegramTransportOptions) {
    this.bot = opts.botFactory();
    this.allowed = new Set(opts.allowList);
    this.bot.on("message:text", async (ctx) => {
      const fromId = ctx.message.from.id;
      if (!this.allowed.has(fromId)) return; // silently drop
      if (!this.handler) return;
      await this.handler({
        chatId: ctx.message.chat.id,
        fromId,
        messageId: ctx.message.message_id,
        text: ctx.message.text,
        dateMs: ctx.message.date * 1000,
      });
    });
  }

  async sendMessage(chatId: number, text: string, opts?: SendMessageOpts): Promise<number> {
    const other = opts?.markdown ? { parse_mode: "MarkdownV2" } : undefined;
    const res = await this.bot.api.sendMessage(chatId, text, other);
    return res.message_id;
  }

  async editMessage(
    chatId: number,
    messageId: number,
    text: string,
    opts?: EditMessageOpts,
  ): Promise<void> {
    const other = opts?.markdown ? { parse_mode: "MarkdownV2" } : undefined;
    await this.bot.api.editMessageText(chatId, messageId, text, other);
  }

  async sendFile(chatId: number, path: string, caption?: string): Promise<void> {
    const other = caption !== undefined ? { caption } : undefined;
    await this.bot.api.sendDocument(chatId, path, other);
  }

  onUpdate(handler: TelegramUpdateHandler): void {
    this.handler = handler;
  }

  async start(): Promise<void> {
    await this.bot.api.deleteWebhook({ drop_pending_updates: false });
    await this.bot.start();
  }

  async stop(): Promise<void> {
    await this.bot.stop();
  }
}

/** Default factory: build a real grammY Bot from a token. */
export function realGrammyBotFactory(token: string): () => GrammyLikeBot {
  return () => new Bot(token) as unknown as GrammyLikeBot;
}
