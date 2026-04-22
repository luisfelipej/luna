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
    setMyCommands(
      commands: ReadonlyArray<{ command: string; description: string }>,
    ): Promise<unknown>;
  };
  on(event: "message:text", handler: (ctx: GrammyMessageTextCtx) => Promise<void> | void): void;
  start(opts?: { onStart?: (info: { username: string }) => void }): Promise<void>;
  stop(): Promise<void>;
}

export interface GrammyTelegramTransportOptions {
  /** Factory that builds the underlying bot. Allows tests to inject a fake. */
  botFactory: () => GrammyLikeBot;
  /** Telegram user IDs allowed to talk to the bot. Empty = allow none. */
  allowList: readonly number[];
  /** Optional logger — receives WARN on truncation + markdown fallback. */
  logger?: LoggerPort;
  /**
   * Slash-command menu registered with Telegram on start() via
   * `setMyCommands`. Shown in the `/` autocomplete popup. Optional — if
   * omitted, no menu is published (existing menu on Telegram's side is
   * preserved).
   */
  commandMenu?: ReadonlyArray<{ command: string; description: string }>;
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
  private readonly commandMenu: ReadonlyArray<{ command: string; description: string }>;
  private handler: TelegramUpdateHandler | null = null;

  constructor(opts: GrammyTelegramTransportOptions) {
    this.bot = opts.botFactory();
    this.allowed = new Set(opts.allowList);
    this.logger = opts.logger;
    this.commandMenu = opts.commandMenu ?? [];
    this.bot.on("message:text", async (ctx) => {
      const fromId = ctx.message.from.id;
      if (!this.allowed.has(fromId)) {
        this.logger?.warn("telegram: dropped update from non-allowed user", {
          fromId,
          allowed: [...this.allowed],
        });
        return;
      }
      if (!this.handler) {
        this.logger?.warn("telegram: no update handler registered", { fromId });
        return;
      }
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
    const wantHtml = opts?.html === true;
    try {
      const parseMode = wantMarkdown ? "MarkdownV2" : wantHtml ? "HTML" : undefined;
      const res = await this.bot.api.sendMessage(
        chatId,
        body,
        parseMode !== undefined ? { parse_mode: parseMode } : undefined,
      );
      return res.message_id;
    } catch (err) {
      if ((wantMarkdown || wantHtml) && isParseError(err)) {
        this.logger?.warn("telegram: parse failed, retrying plain", { chatId });
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
    const wantHtml = opts?.html === true;
    try {
      const parseMode = wantMarkdown ? "MarkdownV2" : wantHtml ? "HTML" : undefined;
      await this.bot.api.editMessageText(
        chatId,
        messageId,
        body,
        parseMode !== undefined ? { parse_mode: parseMode } : undefined,
      );
    } catch (err) {
      if ((wantMarkdown || wantHtml) && isParseError(err)) {
        this.logger?.warn("telegram: parse failed on edit, retrying plain", {
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
    // Install a top-level error handler so grammY does not auto-stop on
    // middleware errors (e.g., transient Telegram API failures).
    const botWithCatch = this.bot as typeof this.bot & {
      catch?: (h: (err: unknown) => void) => void;
    };
    botWithCatch.catch?.((err) => {
      this.logger?.error("telegram middleware error", { err: String(err) });
      console.error("[luna] telegram middleware error:", err);
    });
    await this.bot.api.deleteWebhook({ drop_pending_updates: false });
    if (this.commandMenu.length > 0) {
      try {
        await this.bot.api.setMyCommands([...this.commandMenu]);
      } catch (err) {
        this.logger?.warn("telegram: setMyCommands failed", { err: String(err) });
      }
    }
    // grammY's bot.start() returns a promise that only resolves when the bot
    // STOPS. Awaiting it would block boot forever. Fire-and-forget; errors in
    // the long-poll loop surface via the bot's error handler.
    this.bot
      .start({
        onStart: (info) => {
          this.logger?.info("telegram polling started", { username: info.username });
          console.log(`[luna] telegram polling started as @${info.username}`);
        },
      })
      .catch((err) => {
        this.logger?.error("telegram: bot.start failed", { err: String(err) });
        console.error("[luna] telegram bot.start failed:", err);
      });
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
