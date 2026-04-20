import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { buildHarness, type Harness } from "./harness.ts";

let h: Harness;

beforeAll(async () => {
  h = await buildHarness({
    startHttp: false,
    agentScript: [
      { textSoFar: "hi from fake", done: false },
      {
        textSoFar: "hi from fake",
        done: true,
        response: { sessionId: "sess-1", costUsd: 0.001, durationMs: 10 },
      },
    ],
  });
});
afterAll(async () => {
  await h.stop();
});

describe("Integration: happy path 1 — send message end-to-end", () => {
  it("routes a free-text Telegram update through SendMessageToAgent and records a Telegram send", async () => {
    await h.transport.deliver({
      chatId: h.adminChatId,
      fromId: h.adminChatId,
      messageId: 10,
      text: "hello",
      dateMs: Date.now(),
    });

    // One call to the agent, and at least one outbound Telegram message
    // (send + trailing edit via StreamEventThrottle).
    expect(h.agent.calls.length).toBe(1);
    expect(h.agent.calls[0]?.text).toBe("hello");
    const outbound = [
      ...h.transport.sent.map((s) => s.text),
      ...h.transport.edits.map((e) => e.text),
    ];
    expect(outbound.some((t) => t.includes("hi from fake"))).toBe(true);
  });
});
