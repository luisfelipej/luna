import { createHmac } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { buildHarness, type Harness } from "./harness.ts";

let h: Harness;

beforeAll(async () => {
  h = await buildHarness({ startHttp: true });
});
afterAll(async () => {
  await h.stop();
});

function sign(body: string, secret: string): string {
  return `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;
}

describe("Integration: happy path 3 — GitHub push webhook → Telegram", () => {
  it("valid HMAC push event → admin chat receives formatted notification", async () => {
    const payload = {
      repository: { full_name: "octocat/hello-world" },
      sender: { login: "octocat" },
      compare: "https://github.com/octocat/hello-world/compare/a...b",
      commits: [{}, {}, {}],
    };
    const raw = JSON.stringify(payload);
    const before = h.transport.sent.length;

    const res = await fetch(`http://127.0.0.1:${h.httpPort}/webhook/github`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-github-event": "push",
        "x-hub-signature-256": sign(raw, h.githubSecret),
      },
      body: raw,
    });
    expect(res.status).toBe(204);
    expect(h.transport.sent.length).toBe(before + 1);
    const sent = h.transport.sent.at(-1);
    expect(sent?.chatId).toBe(h.adminChatId);
    expect(sent?.text).toContain("octocat/hello-world");
  });

  it("invalid HMAC → 401 and no Telegram call", async () => {
    const payload = { repository: { full_name: "x/y" } };
    const raw = JSON.stringify(payload);
    const before = h.transport.sent.length;

    const res = await fetch(`http://127.0.0.1:${h.httpPort}/webhook/github`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-github-event": "push",
        "x-hub-signature-256": `sha256=${"0".repeat(64)}`,
      },
      body: raw,
    });
    expect(res.status).toBe(401);
    expect(h.transport.sent.length).toBe(before);
  });
});
