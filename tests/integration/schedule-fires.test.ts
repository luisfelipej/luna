import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { buildHarness, type Harness } from "./harness.ts";

let h: Harness;

beforeAll(async () => {
  h = await buildHarness({
    startHttp: true,
    agentScript: [
      {
        textSoFar: "done",
        done: true,
        response: { sessionId: "s", costUsd: 0, durationMs: 1 },
      },
    ],
  });
});
afterAll(async () => {
  await h.stop();
});

describe("Integration: happy path 2 — schedule fires", () => {
  it("accepts POST /api/schedule for a reminder ~100ms in future and fires via Telegram", async () => {
    const atIso = new Date(Date.now() + 100).toISOString();
    const body = {
      chat_id: h.adminChatId,
      job_type: "reminder",
      name: "integration-reminder",
      kind: "once",
      at_iso: atIso,
      prompt: "time to stand up",
    };

    const res = await fetch(`http://127.0.0.1:${h.httpPort}/api/schedule`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${h.apiSecret}`,
      },
      body: JSON.stringify(body),
    });
    expect(res.status).toBe(202);
    const payload = (await res.json()) as { id: number };
    expect(typeof payload.id).toBe("number");

    // Wait for the scheduler timer to fire the reminder (real clock).
    const deadline = Date.now() + 2000;
    while (Date.now() < deadline) {
      if (h.transport.sent.some((s) => s.text.includes("time to stand up"))) break;
      await new Promise((r) => setTimeout(r, 25));
    }
    expect(h.transport.sent.some((s) => s.text.includes("time to stand up"))).toBe(true);
  });
});
