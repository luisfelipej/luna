import { describe, expect, it } from "bun:test";
import type { TelegramTransport } from "../../../src/adapters/ports/telegram-transport.port.ts";
import { GrammyTelegramTransport } from "../../../src/infra/telegram/grammy-transport.ts";

type TextUpdate = {
  message: {
    message_id: number;
    text: string;
    chat: { id: number };
    from: { id: number };
    date: number;
  };
};
type TextHandler = (ctx: TextUpdate) => Promise<void> | void;

function makeFakeBot() {
  const sent: Array<{ chatId: number; text: string }> = [];
  const edits: Array<{ chatId: number; messageId: number; text: string }> = [];
  const files: Array<{ chatId: number; path: string; caption?: string }> = [];
  let textHandler: TextHandler | null = null;
  let started = false;
  const bot = {
    api: {
      async sendMessage(chatId: number, text: string) {
        sent.push({ chatId, text });
        return { message_id: sent.length };
      },
      async editMessageText(chatId: number, messageId: number, text: string) {
        edits.push({ chatId, messageId, text });
      },
      async sendDocument(chatId: number, path: unknown, other?: { caption?: string }) {
        const entry: { chatId: number; path: string; caption?: string } = {
          chatId,
          path: String(path),
        };
        if (other?.caption !== undefined) entry.caption = other.caption;
        files.push(entry);
      },
      async deleteWebhook(_opts: { drop_pending_updates: boolean }) {},
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
    async _deliver(update: TextUpdate) {
      if (!textHandler) throw new Error("no handler registered");
      await textHandler({ ...update });
    },
    get isStarted() {
      return started;
    },
    sent,
    edits,
    files,
  };
  return bot;
}

describe("GrammyTelegramTransport", () => {
  it("structurally satisfies the streaming TelegramTransport port", () => {
    const bot = makeFakeBot();
    const t: TelegramTransport = new GrammyTelegramTransport({
      botFactory: () => bot as never,
      allowList: [42],
    });
    expect(typeof t.sendMessage).toBe("function");
    expect(typeof t.editMessage).toBe("function");
    expect(typeof t.sendFile).toBe("function");
    expect(typeof t.onUpdate).toBe("function");
  });

  it("sendMessage returns the telegram message_id", async () => {
    const bot = makeFakeBot();
    const t = new GrammyTelegramTransport({
      botFactory: () => bot as never,
      allowList: [42],
    });
    const id = await t.sendMessage(42, "hello");
    expect(id).toBe(1);
    expect(bot.sent).toEqual([{ chatId: 42, text: "hello" }]);
  });

  it("editMessage and sendFile forward through the bot api", async () => {
    const bot = makeFakeBot();
    const t = new GrammyTelegramTransport({
      botFactory: () => bot as never,
      allowList: [42],
    });
    await t.editMessage(42, 7, "edited");
    await t.sendFile(42, "/tmp/x.txt", "here you go");
    expect(bot.edits).toEqual([{ chatId: 42, messageId: 7, text: "edited" }]);
    expect(bot.files).toEqual([{ chatId: 42, path: "/tmp/x.txt", caption: "here you go" }]);
  });

  it("invokes the registered handler for allow-listed senders", async () => {
    const bot = makeFakeBot();
    const t = new GrammyTelegramTransport({
      botFactory: () => bot as never,
      allowList: [42],
    });
    const received: Array<{ chatId: number; fromId: number; text: string | undefined }> = [];
    t.onUpdate(async (m) => {
      received.push({ chatId: m.chatId, fromId: m.fromId, text: m.text });
    });
    await t.start();

    await bot._deliver({
      message: { message_id: 1, text: "hi", chat: { id: 42 }, from: { id: 42 }, date: 1 },
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
    t.onUpdate(async (m) => {
      received.push(m);
    });
    await t.start();

    await bot._deliver({
      message: { message_id: 1, text: "hi", chat: { id: 42 }, from: { id: 999 }, date: 1 },
    });

    expect(received).toEqual([]);
  });

  it("truncates outbound text at the 4096 Telegram limit and appends a marker", async () => {
    const bot = makeFakeBot();
    const warns: Array<{ msg: string; meta?: object }> = [];
    const logger = {
      info() {},
      warn(msg: string, meta?: object) {
        warns.push(meta !== undefined ? { msg, meta } : { msg });
      },
      error() {},
      child() {
        return this;
      },
    };
    const t = new GrammyTelegramTransport({
      botFactory: () => bot as never,
      allowList: [42],
      logger,
    });
    const big = "a".repeat(5000);
    const id = await t.sendMessage(42, big);
    expect(id).toBe(1);
    expect(bot.sent).toHaveLength(1);
    const sent = bot.sent[0]!.text;
    expect(sent.length).toBeLessThanOrEqual(4096);
    expect(sent.endsWith("… (truncated)")).toBe(true);
    expect(warns.length).toBeGreaterThan(0);
    expect(warns[0]!.msg).toContain("truncat");
  });

  it("editMessage truncates identically and warns", async () => {
    const bot = makeFakeBot();
    const warns: string[] = [];
    const logger = {
      info() {},
      warn(msg: string) {
        warns.push(msg);
      },
      error() {},
      child() {
        return this;
      },
    };
    const t = new GrammyTelegramTransport({
      botFactory: () => bot as never,
      allowList: [42],
      logger,
    });
    const big = "z".repeat(4200);
    await t.editMessage(42, 7, big);
    expect(bot.edits[0]!.text.length).toBeLessThanOrEqual(4096);
    expect(bot.edits[0]!.text.endsWith("… (truncated)")).toBe(true);
    expect(warns.length).toBeGreaterThan(0);
  });

  it("MarkdownV2 parse error falls back to plain text on send and edit", async () => {
    const bot = makeFakeBot();
    let firstSend = true;
    bot.api.sendMessage = async (chatId: number, text: string, other?: { parse_mode?: string }) => {
      if (firstSend && other?.parse_mode === "MarkdownV2") {
        firstSend = false;
        const err = new Error("can't parse entities");
        throw err;
      }
      bot.sent.push({ chatId, text });
      return { message_id: bot.sent.length };
    };
    let firstEdit = true;
    bot.api.editMessageText = async (
      chatId: number,
      messageId: number,
      text: string,
      other?: { parse_mode?: string },
    ) => {
      if (firstEdit && other?.parse_mode === "MarkdownV2") {
        firstEdit = false;
        throw new Error("Bad Request: can't parse entities");
      }
      bot.edits.push({ chatId, messageId, text });
    };
    const t = new GrammyTelegramTransport({
      botFactory: () => bot as never,
      allowList: [42],
    });
    const id = await t.sendMessage(42, "*bad*", { markdown: true });
    expect(id).toBeGreaterThan(0);
    expect(bot.sent).toHaveLength(1);
    await t.editMessage(42, id, "*still*", { markdown: true });
    expect(bot.edits).toHaveLength(1);
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
