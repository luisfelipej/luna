import { describe, it, expect } from "bun:test";

/**
 * Task 0.8: real Telegram end-to-end smoke. This is intentionally gated by
 * LUNA_E2E=1 so CI stays green without a real bot token.
 *
 * To run locally:
 *   export LUNA_E2E=1
 *   export TELEGRAM_BOT_TOKEN=...
 *   export TELEGRAM_ALLOWED_IDS=<your-id>
 *   export LUNA_E2E_CHAT_ID=<your-chat-id>
 *   bun test tests/integration/real-telegram.e2e.test.ts
 *
 * The test constructs a real grammY Bot via the production factory and
 * round-trips a single `sendMessage` against the Telegram API. It does NOT
 * start polling — we only exercise the outbound path against live servers.
 */
const E2E = process.env.LUNA_E2E === "1";
const describeIfE2E = E2E ? describe : describe.skip;

describeIfE2E("real Telegram E2E", () => {
  it("sends a live message via the real grammY transport", async () => {
    const { GrammyTelegramTransport, realGrammyBotFactory } = await import(
      "../../src/infra/telegram/grammy-transport.ts"
    );
    const token = process.env.TELEGRAM_BOT_TOKEN;
    const chatIdRaw = process.env.LUNA_E2E_CHAT_ID;
    if (!token || !chatIdRaw) {
      throw new Error("LUNA_E2E=1 requires TELEGRAM_BOT_TOKEN and LUNA_E2E_CHAT_ID");
    }
    const chatId = Number(chatIdRaw);

    const transport = new GrammyTelegramTransport({
      botFactory: realGrammyBotFactory(token),
      allowList: [chatId],
    });

    await transport.sendMessage(chatId, "luna tracer e2e ping");
    // Just asserting no throw is already a live-API proof; grammY throws on HTTP != 200.
    expect(true).toBe(true);
  }, 20_000);
});
