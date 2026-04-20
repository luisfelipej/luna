import { promises as dns } from "node:dns";
import { Agent, request as undiciRequest } from "undici";
import type {
  ServiceProxyPort,
  ServiceProxyRequest,
  ServiceProxyResponse,
} from "../../adapters/ports/service-proxy.port.ts";
import { ConfigError, SSRFError } from "../../entities/errors.ts";
import type { ServiceYamlEntry } from "../config/services-yaml-schema.ts";
import type { ServicesRepo } from "../config/services-repo.ts";
import { isBlockedAddress } from "./ssrf-guard.ts";

export type DnsLookup = (host: string) => Promise<string> | string;

export interface UndiciServiceProxyOptions {
  readonly repo: ServicesRepo;
  /** Env map — typically `process.env`. */
  readonly env: Readonly<Record<string, string | undefined>>;
  /**
   * Optional DNS override used by both the pre-flight SSRF check and the
   * `undici.Agent`'s pinned lookup. Defaults to `dns.promises.lookup`.
   */
  readonly lookup?: DnsLookup;
}

/**
 * `ServiceProxyPort` implementation backed by `undici.Agent`.
 *
 * Pipeline per request:
 *   1. Look up the service entry; 404-equivalent on miss.
 *   2. Resolve target hostname via DNS (injectable for tests).
 *   3. Run the SSRF guard on the resolved IP — reject if blocked (unless
 *      `allow_internal: true` on the service entry; used for test fixtures).
 *   4. Build an `undici.Agent` whose `connect.lookup` returns the SAME pinned
 *      IP. This prevents DNS-rebinding TOCTOU: the guard sees the IP we'll
 *      actually connect to.
 *   5. Inject auth (bearer/header/query) per the service entry.
 *   6. Forward method + path (+ optional `allow_path_suffix`) + merged body.
 *   7. Return status + parsed body (json if content-type permits).
 */
export class UndiciServiceProxy implements ServiceProxyPort {
  private readonly repo: ServicesRepo;
  private readonly env: Readonly<Record<string, string | undefined>>;
  private readonly lookup: DnsLookup;

  constructor(opts: UndiciServiceProxyOptions) {
    this.repo = opts.repo;
    this.env = opts.env;
    this.lookup = opts.lookup ?? (async (host) => (await dns.lookup(host)).address);
  }

  async call(name: string, req: ServiceProxyRequest): Promise<ServiceProxyResponse> {
    const svc = this.repo.byName(name);
    if (!svc) throw new ConfigError(`unknown service: ${name}`);

    const url = new URL(svc.url);
    const resolved = await this.lookup(url.hostname);
    if (!svc.allow_internal && isBlockedAddress(resolved)) {
      throw new SSRFError(`service ${name}: resolved IP ${resolved} is in a blocked range`);
    }

    // Pinned-IP agent — undici calls our `lookup` for every connect attempt.
    // The lookup callback is given the original hostname; we ignore it and
    // return the IP resolved above, which the SSRF guard has already vetted.
    // This closes the TOCTOU gap: a rebind between our lookup and undici's
    // connect cannot swap in a private IP — the IP is fixed in-closure.
    const agent = new Agent({
      connect: {
        lookup: (
          _hostname: string,
          _opts: unknown,
          cb: (err: Error | null, addr: string, family: number) => void,
        ) => {
          const family = resolved.includes(":") ? 6 : 4;
          cb(null, resolved, family);
        },
      },
    });

    const headers: Record<string, string> = {};
    for (const [k, v] of Object.entries(svc.headers ?? {})) headers[k] = v;

    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(svc.params ?? {})) params.set(k, v);
    if (req.params) {
      for (const [k, v] of Object.entries(req.params)) params.set(k, v);
    }

    this.injectAuth(svc, headers, params);

    // Path composition: base path from svc.url, plus optional suffix.
    let path = url.pathname;
    if (req.pathSuffix !== undefined) {
      if (!svc.allow_path_suffix) {
        throw new ConfigError(`service ${name}: path suffix not permitted`);
      }
      if (!req.pathSuffix.startsWith("/")) path += "/";
      path += req.pathSuffix;
    }
    const qs = params.toString();
    if (qs) path += (path.includes("?") ? "&" : "?") + qs;

    let bodyBuf: string | Buffer | undefined;
    if (req.body !== undefined && svc.method !== "GET") {
      if (typeof req.body === "string" || req.body instanceof Uint8Array) {
        bodyBuf = req.body as string | Buffer;
      } else {
        bodyBuf = JSON.stringify(req.body);
        if (!("content-type" in Object.keys(headers).reduce((a, k) => ({ ...a, [k.toLowerCase()]: true }), {} as Record<string, boolean>))) {
          headers["content-type"] = "application/json";
        }
      }
    }

    // Dial the resolved IP directly, preserving the original Host header so
    // any virtual-host routing on the upstream still works. Since this is an
    // HTTP-only path (TLS would need SNI handling), cert matching is N/A.
    const ipHost = resolved.includes(":") ? `[${resolved}]` : resolved;
    const portPart = url.port ? `:${url.port}` : "";
    const originalHost = `${url.hostname}${portPart}`;
    if (!("host" in headers)) headers["host"] = originalHost;
    const origin = `${url.protocol}//${ipHost}${portPart}`;
    try {
      const res = await undiciRequest(`${origin}${path}`, {
        method: svc.method,
        headers,
        dispatcher: agent,
        ...(bodyBuf !== undefined ? { body: bodyBuf } : {}),
      });
      const buf = Buffer.from(await res.body.arrayBuffer());
      const contentType = String(res.headers["content-type"] ?? "");
      let parsed: unknown = buf.toString("utf8");
      if (contentType.includes("application/json")) {
        try {
          parsed = JSON.parse(buf.toString("utf8"));
        } catch {
          /* fall through to string */
        }
      }
      return { status: res.statusCode, body: parsed };
    } finally {
      try {
        const maybeClose = (agent as unknown as { close?: () => Promise<void> }).close;
        if (typeof maybeClose === "function") {
          await maybeClose.call(agent).catch(() => {});
        }
      } catch {
        /* noop */
      }
    }
  }

  private injectAuth(
    svc: ServiceYamlEntry,
    headers: Record<string, string>,
    params: URLSearchParams,
  ): void {
    const auth = svc.auth;
    if (auth.mode === "none") return;

    const token = this.env[auth.env];
    if (!token) {
      throw new ConfigError(
        `service ${svc.name}: credential missing (env ${auth.env} is unset)`,
      );
    }

    switch (auth.mode) {
      case "bearer":
        headers["authorization"] = `Bearer ${token}`;
        return;
      case "header":
        headers[auth.header.toLowerCase()] = token;
        return;
      case "query":
        params.set(auth.param, token);
        return;
    }
  }
}
