import { Bot } from "grammy";
import type { LoggerPort } from "../../adapters/ports/logger.port.ts";
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
  /** Optional logger — receives WARN on truncation + markdown fallback. */
  logger?: LoggerPort;
}

/** Telegram's hard cap on message body length. */
export const TELEGRAM_TEXT_LIMIT = 4096;
const TRUNCATION_MARKER = "… (truncated)";

/**
 * Truncate `text` to fit under the Telegram cap, preferring a word boundary.
 * Appends a visible "… (truncated)" marker. No-op if already short enough.
 */
export function truncateForTelegram(text: string, limit = TELEGRAM_TEXT_LIMIT): string {
  if (text.length <= limit) return text;
  const budget = limit - TRUNCATION_MARKER.length;
  if (budget <= 0) return text.slice(0, limit);
  const head = text.slice(0, budget);
  const lastSpace = head.lastIndexOf(" ");
  const cut = lastSpace > budget * 0.6 ? lastSpace : budget;
  return `${head.slice(0, cut).trimEnd()}${TRUNCATION_MARKER}`;
}

function isParseError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  return /can't parse entities|can not parse entities|bad request.*parse/i.test(err.message);
}

/**
 * grammY-backed TelegramTransport. Filters inbound updates by allow-list;
 * outbound calls return the new message_id so StreamEventThrottle can edit.
 *
 * Respects Telegram's 4096-char cap with a word-boundary truncate + logged
 * warn. Honours `opts.markdown` as `parse_mode: MarkdownV2` with a one-shot
 * fallback to plain text when Telegram rejects entity parsing.
 */
export class GrammyTelegramTransport implements TelegramTransport {
  private readonly bot: GrammyLikeBot;
  private readonly allowed: ReadonlySet<number>;
  private readonly logger: LoggerPort | undefined;
  private handler: TelegramUpdateHandler | null = null;

  constructor(opts: GrammyTelegramTransportOptions) {
    this.bot = opts.botFactory();
    this.allowed = new Set(opts.allowList);
    this.logger = opts.logger;
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
    const body = this.clamp(text, { kind: "send", chatId });
    const wantMarkdown = opts?.markdown === true;
    try {
      const res = await this.bot.api.sendMessage(
        chatId,
        body,
        wantMarkdown ? { parse_mode: "MarkdownV2" } : undefined,
      );
      return res.message_id;
    } catch (err) {
      if (wantMarkdown && isParseError(err)) {
        this.logger?.warn("telegram: markdown parse failed, retrying plain", { chatId });
        const res = await this.bot.api.sendMessage(chatId, body);
        return res.message_id;
      }
      throw err;
    }
  }

  async editMessage(
    chatId: number,
    messageId: number,
    text: string,
    opts?: EditMessageOpts,
  ): Promise<void> {
    const body = this.clamp(text, { kind: "edit", chatId, messageId });
    const wantMarkdown = opts?.markdown === true;
    try {
      await this.bot.api.editMessageText(
        chatId,
        messageId,
        body,
        wantMarkdown ? { parse_mode: "MarkdownV2" } : undefined,
      );
    } catch (err) {
      if (wantMarkdown && isParseError(err)) {
        this.logger?.warn("telegram: markdown parse failed on edit, retrying plain", {
          chatId,
          messageId,
        });
        await this.bot.api.editMessageText(chatId, messageId, body);
        return;
      }
      throw err;
    }
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

  private clamp(
    text: string,
    meta: { kind: "send" | "edit"; chatId: number; messageId?: number },
  ): string {
    if (text.length <= TELEGRAM_TEXT_LIMIT) return text;
    this.logger?.warn(
      `telegram: truncating ${meta.kind} (${text.length} > ${TELEGRAM_TEXT_LIMIT})`,
      {
        chatId: meta.chatId,
        messageId: meta.messageId,
        originalLength: text.length,
      },
    );
    return truncateForTelegram(text);
  }
}

/** Default factory: build a real grammY Bot from a token. */
export function realGrammyBotFactory(token: string): () => GrammyLikeBot {
  return () => new Bot(token) as unknown as GrammyLikeBot;
}
