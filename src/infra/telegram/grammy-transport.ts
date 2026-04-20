import { Bot } from "grammy";
import type {
  InboundHandler,
  TelegramTransport,
} from "../../adapters/ports/telegram-transport.port.ts";

/**
 * Minimal structural type covering the grammY Bot API the tracer needs.
 * We accept the real `Bot` as well as an injected fake in tests.
 */
export interface GrammyLikeBot {
  api: {
    sendMessage(chatId: number, text: string): Promise<unknown>;
    deleteWebhook(opts: { drop_pending_updates: boolean }): Promise<unknown>;
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  on(event: "message:text", handler: (ctx: any) => Promise<void> | void): void;
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
 * Phase-0 tracer transport: polls grammY, filters by allow-list,
 * and exposes the minimal `TelegramTransport` port surface.
 */
export class GrammyTelegramTransport implements TelegramTransport {
  private readonly bot: GrammyLikeBot;
  private readonly allowed: ReadonlySet<number>;
  private handler: InboundHandler | null = null;

  constructor(opts: GrammyTelegramTransportOptions) {
    this.bot = opts.botFactory();
    this.allowed = new Set(opts.allowList);
    this.bot.on("message:text", async (ctx: {
      message: { text: string; chat: { id: number }; from: { id: number } };
    }) => {
      const fromId = ctx.message.from.id;
      if (!this.allowed.has(fromId)) return; // silently drop
      if (!this.handler) return;
      await this.handler({
        chatId: ctx.message.chat.id,
        fromId,
        text: ctx.message.text,
      });
    });
  }

  async sendMessage(chatId: number, text: string): Promise<void> {
    await this.bot.api.sendMessage(chatId, text);
  }

  onMessage(handler: InboundHandler): void {
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
