import { describe, expect, it } from "bun:test";
import { buildTracerContainer } from "../../../src/composition/container.ts";

type TextUpdate = {
  message: {
    message_id: number;
    text: string;
    chat: { id: number };
    from: { id: number };
    date: number;
  };
};

function makeFakeBot() {
  const sent: Array<{ chatId: number; text: string }> = [];
  let handler: ((ctx: TextUpdate) => Promise<void>) | null = null;
  return {
    api: {
      async sendMessage(chatId: number, text: string) {
        sent.push({ chatId, text });
        return { message_id: sent.length };
      },
      async editMessageText() {},
      async sendDocument() {},
      async deleteWebhook() {},
    },
    on(event: string, h: (ctx: TextUpdate) => Promise<void>) {
      if (event === "message:text") handler = h;
    },
    async start() {},
    async stop() {},
    sent,
    async _deliver(u: TextUpdate) {
      if (!handler) throw new Error("no handler");
      await handler(u);
    },
  };
}

function makeUpdate(chatId: number, fromId: number, text: string): TextUpdate {
  return { message: { message_id: 1, text, chat: { id: chatId }, from: { id: fromId }, date: 1 } };
}

describe("buildTracerContainer", () => {
  it("returns start/stop and wires a simulated update to 'echo: <text>'", async () => {
    const bot = makeFakeBot();
    const container = buildTracerContainer({
      env: { TELEGRAM_BOT_TOKEN: "fake-token", TELEGRAM_ALLOWED_IDS: "42" },
      botFactory: () => bot as never,
    });

    expect(typeof container.start).toBe("function");
    expect(typeof container.stop).toBe("function");

    await container.start();
    await bot._deliver(makeUpdate(42, 42, "hi"));
    await Promise.resolve();

    expect(bot.sent).toEqual([{ chatId: 42, text: "echo: hi" }]);

    await container.stop();
  });

  it("rejects an empty TELEGRAM_BOT_TOKEN", () => {
    expect(() =>
      buildTracerContainer({
        env: { TELEGRAM_BOT_TOKEN: "", TELEGRAM_ALLOWED_IDS: "42" },
        botFactory: () => makeFakeBot() as never,
      }),
    ).toThrow();
  });

  it("parses comma-separated allow-list ids", async () => {
    const bot = makeFakeBot();
    const container = buildTracerContainer({
      env: { TELEGRAM_BOT_TOKEN: "t", TELEGRAM_ALLOWED_IDS: "1,2,3" },
      botFactory: () => bot as never,
    });
    await container.start();

    // id 999 not in the list → dropped
    await bot._deliver(makeUpdate(1, 999, "x"));
    await Promise.resolve();
    expect(bot.sent).toEqual([]);

    // id 2 allowed
    await bot._deliver(makeUpdate(2, 2, "y"));
    await Promise.resolve();
    expect(bot.sent).toEqual([{ chatId: 2, text: "echo: y" }]);

    await container.stop();
  });
});
