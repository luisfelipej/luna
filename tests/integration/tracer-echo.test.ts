import { describe, expect, it } from "bun:test";
import { buildTracerContainer } from "../../src/composition/container.ts";

/**
 * Acceptance (Phase 0): a simulated Telegram update delivered via a fake
 * grammY transport results in an `echo: <text>` reply through the fully
 * wired composition root — no real bot token, no network.
 */
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

describe("tracer echo (component-level, fake transport)", () => {
  it("round-trips a Telegram text update to 'echo: <text>'", async () => {
    const bot = makeFakeBot();
    const container = buildTracerContainer({
      env: { TELEGRAM_BOT_TOKEN: "fake", TELEGRAM_ALLOWED_IDS: "42" },
      botFactory: () => bot as never,
    });

    await container.start();
    await bot._deliver({
      message: { text: "hola", chat: { id: 42 }, from: { id: 42 } },
    });
    // let the async handler chain settle
    await Promise.resolve();
    await Promise.resolve();
    await container.stop();

    expect(bot.sent).toEqual([{ chatId: 42, text: "echo: hola" }]);
  });
});
