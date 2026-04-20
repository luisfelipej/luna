import { Hono } from "hono";
import type { JobStore, JobRow } from "../../adapters/ports/job-store.port.ts";
import type { ServiceProxyPort } from "../../adapters/ports/service-proxy.port.ts";
import type {
  WebhookServerPort,
  WebhookServerStatus,
  WebhookEndpointStatus,
} from "../../adapters/ports/webhook-server.port.ts";
import type { Schedule } from "../../entities/job.ts";
import { verifyGithubSignature, constantTimeEqual } from "../../usecases/http/hmac-verifier.ts";
import { parseGithubWebhook } from "../../usecases/http/parse-github-webhook.ts";
import type { RouteWebhookEvent } from "../../usecases/http/route-webhook-event.ts";
import type { makeScheduleJob } from "../../usecases/http/schedule-job.ts";
import type { makeSendProactiveMessage } from "../../usecases/http/send-proactive-message.ts";
import { bearerAuth } from "./bearer-auth.ts";

/** Package version — lazily required so tests don't need to stub it. */
const VERSION = "0.0.1";

export interface HonoWebhookServerOptions {
  readonly githubSecret: string | undefined;
  readonly genericSecret: string | undefined;
  /** Shared secret for `/api/*` bearer auth. Defaults to `genericSecret`. */
  readonly apiSecret: string | undefined;
  readonly adminChatId: number;
  readonly routeWebhookEvent: RouteWebhookEvent;
  readonly sendProactiveMessage: ReturnType<typeof makeSendProactiveMessage>;
  readonly scheduleJob: ReturnType<typeof makeScheduleJob>;
  readonly jobStore: JobStore;
  /** Optional service proxy. Phase 9 supplies the real UndiciServiceProxy. */
  readonly serviceProxy?: ServiceProxyPort;
}

interface EndpointStat {
  enabled: boolean;
  lastEventAt: Date | null;
}

/**
 * Hono-based WebhookServerPort implementation running on `Bun.serve`.
 * Owns the full `/webhook/*` + `/api/*` surface described in sdd/luna/spec.
 */
export class HonoWebhookServer implements WebhookServerPort {
  // Bun's Server is not re-exported as a public type; infer the shape we need.
  private server: ReturnType<typeof Bun.serve> | null = null;
  private port: number | null = null;
  private readonly app: Hono;
  private readonly stats: Record<string, EndpointStat>;

  constructor(private readonly opts: HonoWebhookServerOptions) {
    this.stats = {
      "/webhook/github": { enabled: Boolean(opts.githubSecret), lastEventAt: null },
      "/webhook": { enabled: Boolean(opts.genericSecret), lastEventAt: null },
    };
    this.app = this.buildApp();
  }

  async start(port: number): Promise<void> {
    if (this.server) return;
    const bunServer = Bun.serve({
      port,
      fetch: (req) => this.app.fetch(req),
    });
    this.server = bunServer;
    this.port = typeof bunServer.port === "number" ? bunServer.port : null;
  }

  async stop(): Promise<void> {
    const s = this.server;
    if (!s) return;
    s.stop(true);
    this.server = null;
    this.port = null;
  }

  status(): WebhookServerStatus {
    const endpoints: WebhookEndpointStatus[] = Object.entries(this.stats).map(([name, s]) => ({
      name,
      enabled: s.enabled,
      lastEventAtIso: s.lastEventAt ? s.lastEventAt.toISOString() : null,
    }));
    return {
      running: this.server !== null,
      port: this.port,
      endpoints,
    };
  }

  /** Exposed for tests so they can hit the app without binding a socket. */
  get fetch(): (req: Request) => Response | Promise<Response> {
    return (req) => this.app.fetch(req);
  }

  private recordEvent(name: keyof typeof this.stats): void {
    const s = this.stats[name];
    if (s) s.lastEventAt = new Date();
  }

  private buildApp(): Hono {
    const app = new Hono();
    const o = this.opts;
    const apiSecret = o.apiSecret ?? o.genericSecret;

    // ── /health ────────────────────────────────────────────────────────
    app.get("/health", (c) => c.json({ status: "ok", version: VERSION }));

    // ── POST /webhook/github ───────────────────────────────────────────
    app.post("/webhook/github", async (c) => {
      if (!o.githubSecret) return c.text("Webhook disabled", 503);
      const sig = c.req.header("x-hub-signature-256") ?? null;
      if (!sig) return c.text("Missing signature", 400);
      const eventType = c.req.header("x-github-event");
      if (!eventType) return c.text("Missing event header", 400);

      const rawBuf = Buffer.from(await c.req.arrayBuffer());
      if (
        !verifyGithubSignature({
          body: rawBuf,
          secret: o.githubSecret,
          header: sig,
        })
      ) {
        return c.text("Unauthorized", 401);
      }

      let payload: unknown;
      try {
        payload = JSON.parse(rawBuf.toString("utf8"));
      } catch {
        return c.text("Invalid JSON", 400);
      }

      const ev = parseGithubWebhook(eventType, payload);
      if (ev === null) {
        // Unknown event type OR malformed-for-known-type: spec says 204 no-op
        // for unknown; for malformed we also treat as no-op (logged).
        this.recordEvent("/webhook/github");
        return c.body(null, 204);
      }
      await o.routeWebhookEvent(ev);
      this.recordEvent("/webhook/github");
      return c.body(null, 204);
    });

    // ── POST /webhook (generic) ────────────────────────────────────────
    app.post("/webhook", async (c) => {
      if (!o.genericSecret) return c.text("Webhook disabled", 503);
      const provided = c.req.header("x-webhook-secret");
      if (!provided || !constantTimeEqual(provided, o.genericSecret)) {
        return c.text("Unauthorized", 401);
      }
      let body: unknown;
      try {
        body = await c.req.json();
      } catch {
        return c.text("Invalid JSON", 400);
      }
      const parsed = parseGenericBody(body);
      if (!parsed.ok) return c.text(parsed.error, 400);
      const chatId = parsed.value.chatId ?? o.adminChatId;
      // Non-blocking: fire-and-forget so 202 returns quickly.
      void o
        .routeWebhookEvent({
          kind: "generic",
          text: parsed.value.text,
          mode: parsed.value.mode,
          chatId,
        })
        .catch(() => {
          /* logged upstream */
        });
      this.recordEvent("/webhook");
      return c.body(null, 202);
    });

    // ── /api/* (bearer-authed) ─────────────────────────────────────────
    const api = new Hono();
    api.use("*", bearerAuth(apiSecret));

    api.post("/schedule", async (c) => {
      let body: unknown;
      try {
        body = await c.req.json();
      } catch {
        return c.text("Invalid JSON", 400);
      }
      const parsed = parseSchedulePayload(body);
      if (!parsed.ok) return c.text(parsed.error, 400);
      try {
        const { id } = await o.scheduleJob(parsed.value);
        return c.json({ id, status: "scheduler_pending" }, 202);
      } catch (err) {
        return c.text(err instanceof Error ? err.message : "schedule rejected", 400);
      }
    });

    api.get("/jobs", async (c) => {
      const chatStr = c.req.query("chat_id");
      const allJobs =
        chatStr !== undefined
          ? await o.jobStore.list(Number(chatStr))
          : await o.jobStore.allActive();
      return c.json(allJobs.map(serializeJob));
    });

    api.delete("/jobs/:id", async (c) => {
      const id = Number(c.req.param("id"));
      if (!Number.isFinite(id)) return c.text("Invalid id", 400);
      const existing = await o.jobStore.get(id);
      if (!existing) return c.text("Not found", 404);
      await o.jobStore.delete(id);
      return c.body(null, 204);
    });

    api.post("/service/:name", async (c) => {
      if (!o.serviceProxy) {
        return c.json({ error: "Phase 9 pending" }, 501);
      }
      const name = c.req.param("name");
      let body: unknown = undefined;
      try {
        body = await c.req.json();
      } catch {
        /* optional body */
      }
      const resp = await o.serviceProxy.call(name, { body });
      return c.json(resp.body, resp.status as never);
    });

    api.post("/send-message", async (c) => {
      let body: unknown;
      try {
        body = await c.req.json();
      } catch {
        return c.text("Invalid JSON", 400);
      }
      const parsed = parseSendMessagePayload(body);
      if (!parsed.ok) return c.text(parsed.error, 400);
      try {
        await o.sendProactiveMessage({
          chatId: parsed.value.chatId,
          text: parsed.value.text,
        });
      } catch (err) {
        return c.text(err instanceof Error ? err.message : "forbidden", 403);
      }
      return c.body(null, 202);
    });

    api.post("/send-file", async (c) => {
      const type = c.req.header("content-type") ?? "";
      let chatId: number;
      let filePath: string;
      let caption: string | undefined;
      if (type.includes("multipart/form-data")) {
        const form = await c.req.formData();
        const cid = form.get("chat_id");
        const fp = form.get("path");
        const cap = form.get("caption");
        if (typeof cid !== "string" || typeof fp !== "string") {
          return c.text("chat_id and path are required", 400);
        }
        chatId = Number(cid);
        filePath = fp;
        if (typeof cap === "string") caption = cap;
      } else {
        let body: unknown;
        try {
          body = await c.req.json();
        } catch {
          return c.text("Invalid body", 400);
        }
        const parsed = parseSendFilePayload(body);
        if (!parsed.ok) return c.text(parsed.error, 400);
        chatId = parsed.value.chatId;
        filePath = parsed.value.path;
        if (parsed.value.caption !== undefined) caption = parsed.value.caption;
      }
      if (!Number.isFinite(chatId)) return c.text("Invalid chat_id", 400);
      // Basic path confinement (Phase 10 replaces with realpath+FsPort check).
      if (filePath.includes("..") || !filePath.startsWith("/")) {
        return c.text("Path not allowed", 403);
      }
      try {
        await o.sendProactiveMessage(
          caption !== undefined ? { chatId, filePath, caption } : { chatId, filePath },
        );
      } catch (err) {
        return c.text(err instanceof Error ? err.message : "forbidden", 403);
      }
      return c.body(null, 202);
    });

    app.route("/api", api);
    return app;
  }
}

// ── helpers ──────────────────────────────────────────────────────────────

interface ParseOk<T> {
  readonly ok: true;
  readonly value: T;
}
interface ParseErr {
  readonly ok: false;
  readonly error: string;
}

interface GenericBody {
  readonly text: string;
  readonly mode: "agent" | "reminder";
  readonly chatId?: number;
}

function parseGenericBody(x: unknown): ParseOk<GenericBody> | ParseErr {
  if (typeof x !== "object" || x === null) return { ok: false, error: "body must be object" };
  const o = x as Record<string, unknown>;
  if (typeof o.text !== "string") return { ok: false, error: "text: required string" };
  const mode = o.mode ?? "agent";
  if (mode !== "agent" && mode !== "reminder") {
    return { ok: false, error: "mode must be 'agent' | 'reminder'" };
  }
  const chatIdRaw = o.chat_id ?? o.chatId;
  let chatId: number | undefined;
  if (chatIdRaw !== undefined) {
    if (typeof chatIdRaw !== "number" || !Number.isFinite(chatIdRaw)) {
      return { ok: false, error: "chat_id must be number" };
    }
    chatId = chatIdRaw;
  }
  return {
    ok: true,
    value: chatId !== undefined ? { text: o.text, mode, chatId } : { text: o.text, mode },
  };
}

interface SchedulePayload {
  readonly chatId: number;
  readonly name: string;
  readonly jobType: "agent" | "reminder";
  readonly prompt: string;
  readonly schedule: Schedule;
}

function parseSchedulePayload(x: unknown): ParseOk<SchedulePayload> | ParseErr {
  if (typeof x !== "object" || x === null) return { ok: false, error: "body must be object" };
  const o = x as Record<string, unknown>;
  const chatId = o.chat_id ?? o.chatId;
  if (typeof chatId !== "number") return { ok: false, error: "chat_id: required number" };
  if (typeof o.name !== "string") return { ok: false, error: "name: required string" };
  const jobType = (o.job_type ?? o.jobType ?? "reminder") as unknown;
  if (jobType !== "agent" && jobType !== "reminder") {
    return { ok: false, error: "job_type must be 'agent'|'reminder'" };
  }
  const prompt = typeof o.prompt === "string" ? o.prompt : "";
  const kind = o.kind ?? (o.schedule as Record<string, unknown> | undefined)?.kind;
  let schedule: Schedule;
  switch (kind) {
    case "once": {
      const at = (o.at_iso ?? o.atIso ?? (o.schedule as Record<string, unknown>)?.atIso) as unknown;
      if (typeof at !== "string") return { ok: false, error: "at_iso: required string" };
      schedule = { kind: "once", atIso: at };
      break;
    }
    case "interval": {
      const sec = (o.seconds ?? (o.schedule as Record<string, unknown>)?.seconds) as unknown;
      if (typeof sec !== "number" || sec <= 0) {
        return { ok: false, error: "seconds: required positive number" };
      }
      const first = (o.first_run_iso ??
        o.firstRunIso ??
        (o.schedule as Record<string, unknown>)?.firstRunIso) as unknown;
      schedule =
        typeof first === "string"
          ? { kind: "interval", seconds: sec, firstRunIso: first }
          : { kind: "interval", seconds: sec };
      break;
    }
    case "daily": {
      const times = (o.times_utc ??
        o.timesUtc ??
        (o.schedule as Record<string, unknown>)?.timesUtc) as unknown;
      if (!Array.isArray(times) || !times.every((t) => typeof t === "string")) {
        return { ok: false, error: "times_utc: required string[]" };
      }
      schedule = { kind: "daily", timesUtc: times as string[] };
      break;
    }
    default:
      return { ok: false, error: "kind must be 'once'|'interval'|'daily'" };
  }
  return {
    ok: true,
    value: { chatId, name: o.name, jobType, prompt, schedule },
  };
}

interface SendMessagePayload {
  readonly chatId: number;
  readonly text: string;
}

function parseSendMessagePayload(x: unknown): ParseOk<SendMessagePayload> | ParseErr {
  if (typeof x !== "object" || x === null) return { ok: false, error: "body must be object" };
  const o = x as Record<string, unknown>;
  const chatId = o.chat_id ?? o.chatId;
  if (typeof chatId !== "number") return { ok: false, error: "chat_id: required number" };
  if (typeof o.text !== "string") return { ok: false, error: "text: required string" };
  return { ok: true, value: { chatId, text: o.text } };
}

interface SendFilePayload {
  readonly chatId: number;
  readonly path: string;
  readonly caption?: string;
}

function parseSendFilePayload(x: unknown): ParseOk<SendFilePayload> | ParseErr {
  if (typeof x !== "object" || x === null) return { ok: false, error: "body must be object" };
  const o = x as Record<string, unknown>;
  const chatId = o.chat_id ?? o.chatId;
  if (typeof chatId !== "number") return { ok: false, error: "chat_id: required number" };
  if (typeof o.path !== "string") return { ok: false, error: "path: required string" };
  const caption = typeof o.caption === "string" ? o.caption : undefined;
  return {
    ok: true,
    value: caption !== undefined ? { chatId, path: o.path, caption } : { chatId, path: o.path },
  };
}

function serializeJob(j: JobRow): Record<string, unknown> {
  return {
    id: j.id,
    chat_id: j.chatId,
    name: j.name,
    job_type: j.jobType,
    prompt: j.prompt,
    schedule: j.schedule,
    active: j.active,
    auto_remove: j.autoRemove,
    fired_at: j.firedAt ? j.firedAt.toISOString() : null,
    created_at: j.createdAt.toISOString(),
  };
}
