import { describe, expect, it } from "bun:test";
import { buildTracerContainer } from "../../../src/composition/container.ts";

type TextUpdate = {
  message: { text: string; chat: { id: number }; from: { id: number } };
};

function makeFakeBot() {
  const sent: Array<{ chatId: number; text: string }> = [];
  let handler: ((ctx: TextUpdate) => Promise<void>) | null = null;
  return {
    api: {
      async sendMessage(chatId: number, text: string) {
        sent.push({ chatId, text });
      },
      async deleteWebhook() {
        /* noop */
      },
    },
    on(event: string, h: (ctx: TextUpdate) => Promise<void>) {
      if (event === "message:text") handler = h;
    },
    async start() {
      /* noop */
    },
    async stop() {
      /* noop */
    },
    sent,
    async _deliver(u: TextUpdate) {
      if (!handler) throw new Error("no handler");
      await handler(u);
    },
  };
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

    await bot._deliver({
      message: { text: "hi", chat: { id: 42 }, from: { id: 42 } },
    });

    // give async handler a tick to resolve
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
    await bot._deliver({
      message: { text: "x", chat: { id: 1 }, from: { id: 999 } },
    });
    await Promise.resolve();
    expect(bot.sent).toEqual([]);
    // id 2 allowed
    await bot._deliver({
      message: { text: "y", chat: { id: 2 }, from: { id: 2 } },
    });
    await Promise.resolve();
    expect(bot.sent).toEqual([{ chatId: 2, text: "echo: y" }]);
    await container.stop();
  });
});
