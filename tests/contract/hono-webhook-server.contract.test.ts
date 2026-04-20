import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { HonoWebhookServer } from "../../src/composition/http/hono-webhook-server.ts";
import { makeRouteWebhookEvent } from "../../src/usecases/http/route-webhook-event.ts";
import { makeScheduleJob } from "../../src/usecases/http/schedule-job.ts";
import { makeSendProactiveMessage } from "../../src/usecases/http/send-proactive-message.ts";
import type { ServiceProxyPort } from "../../src/adapters/ports/service-proxy.port.ts";
import { FakeJobStore } from "../helpers/fakes/fake-job-store.ts";
import { FakeTelegramTransport } from "../helpers/fakes/fake-telegram-transport.ts";

const GH_SECRET = "gh-s3cr3t";
const GEN_SECRET = "gen-s3cr3t";
const API_SECRET = "api-s3cr3t";
const ADMIN_CHAT = 123;

function sign(body: string, secret = GH_SECRET): string {
  return "sha256=" + createHmac("sha256", secret).update(body).digest("hex");
}

interface Fixture {
  server: HonoWebhookServer;
  baseUrl: string;
  transport: FakeTelegramTransport;
  jobStore: FakeJobStore;
}

async function makeFixture(
  opts: {
    githubSecret?: string | undefined;
    genericSecret?: string | undefined;
    apiSecret?: string | undefined;
    serviceProxy?: ServiceProxyPort;
  } = {},
): Promise<Fixture> {
  const transport = new FakeTelegramTransport();
  const jobStore = new FakeJobStore();
  const server = new HonoWebhookServer({
    githubSecret: "githubSecret" in opts ? opts.githubSecret : GH_SECRET,
    genericSecret: "genericSecret" in opts ? opts.genericSecret : GEN_SECRET,
    apiSecret: "apiSecret" in opts ? opts.apiSecret : API_SECRET,
    adminChatId: ADMIN_CHAT,
    routeWebhookEvent: makeRouteWebhookEvent({ transport, adminChatId: ADMIN_CHAT }),
    sendProactiveMessage: makeSendProactiveMessage({
      transport,
      allowList: [ADMIN_CHAT, 999],
    }),
    scheduleJob: makeScheduleJob({ jobStore }),
    jobStore,
    ...(opts.serviceProxy ? { serviceProxy: opts.serviceProxy } : {}),
  });
  await server.start(0); // ephemeral port
  const { port } = server.status();
  return { server, baseUrl: `http://127.0.0.1:${port}`, transport, jobStore };
}

describe("HonoWebhookServer — live Bun.serve", () => {
  let fx: Fixture;
  afterEach(async () => {
    await fx?.server.stop();
  });

  it("GET /health returns 200 {status,version}", async () => {
    fx = await makeFixture();
    const r = await fetch(`${fx.baseUrl}/health`);
    expect(r.status).toBe(200);
    const body = (await r.json()) as Record<string, unknown>;
    expect(body.status).toBe("ok");
    expect(typeof body.version).toBe("string");
  });

  it("start/stop/status reports running flag + port + endpoint list", async () => {
    fx = await makeFixture();
    const s = fx.server.status();
    expect(s.running).toBe(true);
    expect(typeof s.port).toBe("number");
    expect(s.endpoints.map((e) => e.name).sort()).toEqual(["/webhook", "/webhook/github"]);
    await fx.server.stop();
    expect(fx.server.status().running).toBe(false);
  });

  describe("POST /webhook/github", () => {
    it("valid signature → 204 and routes to transport", async () => {
      fx = await makeFixture();
      const payload = {
        repository: { full_name: "octocat/hello" },
        sender: { login: "octocat" },
        compare: "https://x/cmp",
        commits: [{}, {}],
      };
      const raw = JSON.stringify(payload);
      const r = await fetch(`${fx.baseUrl}/webhook/github`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-github-event": "push",
          "x-hub-signature-256": sign(raw),
        },
        body: raw,
      });
      expect(r.status).toBe(204);
      expect(fx.transport.sent).toHaveLength(1);
      expect(fx.transport.sent[0]?.chatId).toBe(ADMIN_CHAT);
      expect(fx.transport.sent[0]?.text).toContain("octocat/hello");
    });

    it("invalid signature → 401, no transport call", async () => {
      fx = await makeFixture();
      const raw = JSON.stringify({ x: 1 });
      const r = await fetch(`${fx.baseUrl}/webhook/github`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-github-event": "push",
          "x-hub-signature-256": "sha256=" + "0".repeat(64),
        },
        body: raw,
      });
      expect(r.status).toBe(401);
      expect(fx.transport.sent).toHaveLength(0);
    });

    it("missing signature header → 400", async () => {
      fx = await makeFixture();
      const r = await fetch(`${fx.baseUrl}/webhook/github`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-github-event": "push" },
        body: "{}",
      });
      expect(r.status).toBe(400);
    });

    it("secret not configured → 503", async () => {
      fx = await makeFixture({ githubSecret: undefined });
      const r = await fetch(`${fx.baseUrl}/webhook/github`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
      });
      expect(r.status).toBe(503);
    });

    it("valid signature but invalid JSON → 400", async () => {
      fx = await makeFixture();
      const raw = "not json";
      const r = await fetch(`${fx.baseUrl}/webhook/github`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-github-event": "push",
          "x-hub-signature-256": sign(raw),
        },
        body: raw,
      });
      expect(r.status).toBe(400);
    });

    it("unknown event type → 204 no-op", async () => {
      fx = await makeFixture();
      const raw = JSON.stringify({
        repository: { full_name: "o/h" },
        sender: { login: "x" },
      });
      const r = await fetch(`${fx.baseUrl}/webhook/github`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-github-event": "star",
          "x-hub-signature-256": sign(raw),
        },
        body: raw,
      });
      expect(r.status).toBe(204);
      expect(fx.transport.sent).toHaveLength(0);
    });
  });

  describe("POST /webhook (generic)", () => {
    it("valid secret + body → 202, routes to admin chat", async () => {
      fx = await makeFixture();
      const r = await fetch(`${fx.baseUrl}/webhook`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-webhook-secret": GEN_SECRET,
        },
        body: JSON.stringify({ text: "deploy done" }),
      });
      expect(r.status).toBe(202);
      // Delivery is fire-and-forget; wait a tick.
      await new Promise((r) => setTimeout(r, 10));
      expect(fx.transport.sent.at(-1)?.text).toBe("deploy done");
    });

    it("wrong secret → 401", async () => {
      fx = await makeFixture();
      const r = await fetch(`${fx.baseUrl}/webhook`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-webhook-secret": "wrong" },
        body: JSON.stringify({ text: "hi" }),
      });
      expect(r.status).toBe(401);
    });

    it("secret not configured → 503", async () => {
      fx = await makeFixture({ genericSecret: undefined, apiSecret: API_SECRET });
      const r = await fetch(`${fx.baseUrl}/webhook`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text: "hi" }),
      });
      expect(r.status).toBe(503);
    });

    it("malformed body → 400", async () => {
      fx = await makeFixture();
      const r = await fetch(`${fx.baseUrl}/webhook`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-webhook-secret": GEN_SECRET },
        body: JSON.stringify({ text: 123 }),
      });
      expect(r.status).toBe(400);
    });
  });

  describe("/api/* bearer auth", () => {
    it("rejects missing Authorization with 401", async () => {
      fx = await makeFixture();
      const r = await fetch(`${fx.baseUrl}/api/jobs`);
      expect(r.status).toBe(401);
    });

    it("accepts Bearer <token>", async () => {
      fx = await makeFixture();
      const r = await fetch(`${fx.baseUrl}/api/jobs`, {
        headers: { authorization: `Bearer ${API_SECRET}` },
      });
      expect(r.status).toBe(200);
    });

    it("503 when API secret is unset", async () => {
      fx = await makeFixture({ apiSecret: undefined, genericSecret: undefined });
      const r = await fetch(`${fx.baseUrl}/api/jobs`, {
        headers: { authorization: `Bearer x` },
      });
      expect(r.status).toBe(503);
    });
  });

  describe("POST /api/schedule", () => {
    it("persists a once job and returns 202 + id", async () => {
      fx = await makeFixture();
      const r = await fetch(`${fx.baseUrl}/api/schedule`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${API_SECRET}`,
        },
        body: JSON.stringify({
          chat_id: ADMIN_CHAT,
          name: "test",
          kind: "once",
          at_iso: "2030-01-01T00:00:00Z",
          prompt: "do it",
        }),
      });
      expect(r.status).toBe(202);
      const body = (await r.json()) as Record<string, unknown>;
      expect(typeof body.id).toBe("number");
      expect(body.status).toBe("scheduler_pending");
      expect(await fx.jobStore.list(ADMIN_CHAT)).toHaveLength(1);
    });

    it("rejects unknown schedule kind with 400", async () => {
      fx = await makeFixture();
      const r = await fetch(`${fx.baseUrl}/api/schedule`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${API_SECRET}`,
        },
        body: JSON.stringify({
          chat_id: ADMIN_CHAT,
          name: "bad",
          kind: "quarterly",
        }),
      });
      expect(r.status).toBe(400);
    });
  });

  describe("GET /api/jobs + DELETE /api/jobs/:id", () => {
    it("lists + deletes via JobStore", async () => {
      fx = await makeFixture();
      await fx.jobStore.insert({
        chatId: ADMIN_CHAT,
        name: "x",
        jobType: "reminder",
        prompt: "p",
        schedule: { kind: "once", atIso: "2030-01-01T00:00:00Z" },
        active: true,
        autoRemove: false,
        createdAt: new Date(),
      });
      const list = await fetch(`${fx.baseUrl}/api/jobs?chat_id=${ADMIN_CHAT}`, {
        headers: { authorization: `Bearer ${API_SECRET}` },
      });
      expect(list.status).toBe(200);
      const rows = (await list.json()) as unknown[];
      expect(rows).toHaveLength(1);
      const id = (rows[0] as { id: number }).id;

      const del = await fetch(`${fx.baseUrl}/api/jobs/${id}`, {
        method: "DELETE",
        headers: { authorization: `Bearer ${API_SECRET}` },
      });
      expect(del.status).toBe(204);
      expect(await fx.jobStore.list(ADMIN_CHAT)).toHaveLength(0);
    });

    it("DELETE unknown id → 404", async () => {
      fx = await makeFixture();
      const r = await fetch(`${fx.baseUrl}/api/jobs/9999`, {
        method: "DELETE",
        headers: { authorization: `Bearer ${API_SECRET}` },
      });
      expect(r.status).toBe(404);
    });
  });

  describe("POST /api/service/:name (Phase 9 stub)", () => {
    it("501 when no proxy is wired", async () => {
      fx = await makeFixture();
      const r = await fetch(`${fx.baseUrl}/api/service/foo`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${API_SECRET}`,
        },
        body: JSON.stringify({ any: 1 }),
      });
      expect(r.status).toBe(501);
    });

    it("relays through an injected ServiceProxyPort", async () => {
      const calls: Array<{ name: string; body: unknown }> = [];
      const proxy: ServiceProxyPort = {
        async call(name, req) {
          calls.push({ name, body: req.body });
          return { status: 200, body: { ok: true, echo: req.body } };
        },
      };
      fx = await makeFixture({ serviceProxy: proxy });
      const r = await fetch(`${fx.baseUrl}/api/service/weather`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${API_SECRET}`,
        },
        body: JSON.stringify({ city: "Santiago" }),
      });
      expect(r.status).toBe(200);
      const body = (await r.json()) as Record<string, unknown>;
      expect(body.ok).toBe(true);
      expect(calls[0]?.name).toBe("weather");
    });
  });

  describe("POST /api/send-message + /api/send-file", () => {
    it("send-message forwards to TelegramTransport", async () => {
      fx = await makeFixture();
      const r = await fetch(`${fx.baseUrl}/api/send-message`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${API_SECRET}`,
        },
        body: JSON.stringify({ chat_id: ADMIN_CHAT, text: "yo" }),
      });
      expect(r.status).toBe(202);
      expect(fx.transport.sent.at(-1)).toEqual({ chatId: ADMIN_CHAT, text: "yo" });
    });

    it("send-message to non-allow-listed chat → 403", async () => {
      fx = await makeFixture();
      const r = await fetch(`${fx.baseUrl}/api/send-message`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${API_SECRET}`,
        },
        body: JSON.stringify({ chat_id: 0, text: "yo" }),
      });
      expect(r.status).toBe(403);
    });

    it("send-file JSON body forwards to sendFile", async () => {
      fx = await makeFixture();
      const r = await fetch(`${fx.baseUrl}/api/send-file`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${API_SECRET}`,
        },
        body: JSON.stringify({ chat_id: ADMIN_CHAT, path: "/tmp/a.txt", caption: "c" }),
      });
      expect(r.status).toBe(202);
      expect(fx.transport.files.at(-1)).toEqual({
        chatId: ADMIN_CHAT,
        path: "/tmp/a.txt",
        caption: "c",
      });
    });

    it("send-file rejects traversal with 403", async () => {
      fx = await makeFixture();
      const r = await fetch(`${fx.baseUrl}/api/send-file`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${API_SECRET}`,
        },
        body: JSON.stringify({ chat_id: ADMIN_CHAT, path: "/tmp/../etc/passwd" }),
      });
      expect(r.status).toBe(403);
    });
  });
});
