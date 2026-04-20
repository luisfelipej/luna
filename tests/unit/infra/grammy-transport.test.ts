import { describe, expect, it } from "bun:test";
import type { TelegramTransport } from "../../../src/adapters/ports/telegram-transport.port.ts";
import { GrammyTelegramTransport } from "../../../src/infra/telegram/grammy-transport.ts";

/**
 * A fake grammY-like Bot that captures outgoing sendMessage calls and
 * lets tests synthesize inbound `message:text` updates.
 */
type TextUpdate = {
  message: {
    text: string;
    chat: { id: number };
    from: { id: number };
  };
};
type TextHandler = (ctx: { match?: unknown } & TextUpdate) => Promise<void> | void;

function makeFakeBot() {
  const sent: Array<{ chatId: number; text: string }> = [];
  let textHandler: TextHandler | null = null;
  let started = false;
  const bot = {
    api: {
      async sendMessage(chatId: number, text: string) {
        sent.push({ chatId, text });
        return { message_id: sent.length };
      },
      async deleteWebhook(_opts: { drop_pending_updates: boolean }) {
        /* noop */
      },
    },
    on(event: string, handler: TextHandler) {
      if (event === "message:text") textHandler = handler;
    },
    async start() {
      started = true;
    },
    async stop() {
      started = false;
    },
    // helper for tests to inject a synthetic update
    async _deliver(update: TextUpdate) {
      if (!textHandler) throw new Error("no handler registered");
      await textHandler({ ...update });
    },
    get isStarted() {
      return started;
    },
    sent,
  };
  return bot;
}

describe("GrammyTelegramTransport", () => {
  it("structurally satisfies the TelegramTransport port", () => {
    const bot = makeFakeBot();
    const t: TelegramTransport = new GrammyTelegramTransport({
      botFactory: () => bot as never,
      allowList: [42],
    });
    expect(typeof t.sendMessage).toBe("function");
    expect(typeof t.onMessage).toBe("function");
    expect(typeof t.start).toBe("function");
    expect(typeof t.stop).toBe("function");
  });

  it("forwards sendMessage through the grammY bot.api", async () => {
    const bot = makeFakeBot();
    const t = new GrammyTelegramTransport({
      botFactory: () => bot as never,
      allowList: [42],
    });

    await t.sendMessage(42, "hello");

    expect(bot.sent).toEqual([{ chatId: 42, text: "hello" }]);
  });

  it("invokes the registered handler for allow-listed senders", async () => {
    const bot = makeFakeBot();
    const t = new GrammyTelegramTransport({
      botFactory: () => bot as never,
      allowList: [42],
    });
    const received: Array<{ chatId: number; fromId: number; text: string }> = [];
    t.onMessage(async (m) => {
      received.push(m);
    });
    await t.start();

    await bot._deliver({
      message: { text: "hi", chat: { id: 42 }, from: { id: 42 } },
    });

    expect(received).toEqual([{ chatId: 42, fromId: 42, text: "hi" }]);
  });

  it("silently drops updates from non-allow-listed senders", async () => {
    const bot = makeFakeBot();
    const t = new GrammyTelegramTransport({
      botFactory: () => bot as never,
      allowList: [42],
    });
    const received: Array<unknown> = [];
    t.onMessage(async (m) => {
      received.push(m);
    });
    await t.start();

    await bot._deliver({
      message: { text: "hi", chat: { id: 42 }, from: { id: 999 } },
    });

    expect(received).toEqual([]);
  });

  it("start() calls deleteWebhook and bot.start; stop() stops", async () => {
    const bot = makeFakeBot();
    let deletedWebhook = false;
    bot.api.deleteWebhook = async () => {
      deletedWebhook = true;
    };
    const t = new GrammyTelegramTransport({
      botFactory: () => bot as never,
      allowList: [42],
    });
    await t.start();
    expect(deletedWebhook).toBe(true);
    expect(bot.isStarted).toBe(true);
    await t.stop();
    expect(bot.isStarted).toBe(false);
  });
});
