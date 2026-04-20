import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { createServer, type Server } from "node:http";
import { SSRFError } from "../../src/entities/errors.ts";
import { ServicesRepo } from "../../src/infra/config/services-repo.ts";
import { UndiciServiceProxy } from "../../src/infra/proxy/undici-service-proxy.ts";

/**
 * Spin up a tiny local HTTP server that echoes the request back so we can
 * assert injected auth + forwarded body + resolved path. Using 127.0.0.1 +
 * a stub DNS lookup that returns that literal — this keeps the happy path
 * testable even though 127.x is in the block-list (we use allow_internal
 * for the test service entries; the rebind test plants a different service
 * with `allow_internal:false` and asserts SSRFError).
 */
let server: Server;
let port = 0;

interface EchoRecord {
  method: string;
  path: string;
  headers: Record<string, string>;
  body: string;
}

const received: EchoRecord[] = [];

beforeAll(async () => {
  await new Promise<void>((resolve) => {
    server = createServer((req, res) => {
      const chunks: Buffer[] = [];
      req.on("data", (c) => chunks.push(Buffer.from(c)));
      req.on("end", () => {
        const body = Buffer.concat(chunks).toString("utf8");
        const hdrs: Record<string, string> = {};
        for (const [k, v] of Object.entries(req.headers)) {
          if (typeof v === "string") hdrs[k] = v;
        }
        received.push({
          method: req.method ?? "",
          path: req.url ?? "",
          headers: hdrs,
          body,
        });
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ ok: true, echoed: body }));
      });
    });
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      if (typeof addr === "object" && addr !== null) port = addr.port;
      resolve();
    });
  });
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) =>
    server.close((err) => (err ? reject(err) : resolve())),
  );
});

function yamlFor(port: number): string {
  return `
services:
  - name: echo-bearer
    url: http://localhost.test:${port}/echo
    method: POST
    auth:
      mode: bearer
      env: ECHO_TOKEN
    allow_internal: true
  - name: echo-header
    url: http://localhost.test:${port}/echo
    method: POST
    auth:
      mode: header
      env: ECHO_KEY
      header: X-Api-Key
    allow_internal: true
  - name: echo-query
    url: http://localhost.test:${port}/echo
    method: GET
    auth:
      mode: query
      env: ECHO_Q
      param: api_key
    allow_internal: true
  - name: echo-suffix
    url: http://localhost.test:${port}/base
    method: GET
    auth:
      mode: none
    allow_path_suffix: true
    allow_internal: true
`;
}

const goodDns = (host: string): string => {
  if (host === "localhost.test") return "127.0.0.1";
  if (host === "rebind.test") return "10.0.0.5"; // blocked range
  if (host === "metadata.test") return "169.254.169.254";
  return "8.8.8.8";
};

describe("UndiciServiceProxy — contract", () => {
  it("forwards POST with bearer auth + JSON body", async () => {
    received.length = 0;
    const repo = new ServicesRepo(yamlFor(port));
    const proxy = new UndiciServiceProxy({
      repo,
      env: { ECHO_TOKEN: "s3cret" },
      lookup: goodDns,
    });
    const res = await proxy.call("echo-bearer", { body: { hello: "world" } });
    expect(res.status).toBe(200);
    expect(received).toHaveLength(1);
    const rec = received[0];
    if (!rec) throw new Error("expected record");
    expect(rec.method).toBe("POST");
    expect(rec.headers.authorization).toBe("Bearer s3cret");
    expect(rec.body).toContain("world");
  });

  it("injects a header auth", async () => {
    received.length = 0;
    const repo = new ServicesRepo(yamlFor(port));
    const proxy = new UndiciServiceProxy({
      repo,
      env: { ECHO_KEY: "abc" },
      lookup: goodDns,
    });
    await proxy.call("echo-header", { body: { ping: 1 } });
    expect(received[0]?.headers["x-api-key"]).toBe("abc");
  });

  it("injects a query-param auth", async () => {
    received.length = 0;
    const repo = new ServicesRepo(yamlFor(port));
    const proxy = new UndiciServiceProxy({
      repo,
      env: { ECHO_Q: "qqq" },
      lookup: goodDns,
    });
    await proxy.call("echo-query", {});
    expect(received[0]?.path).toContain("api_key=qqq");
  });

  it("appends path suffix when allow_path_suffix is true", async () => {
    received.length = 0;
    const repo = new ServicesRepo(yamlFor(port));
    const proxy = new UndiciServiceProxy({
      repo,
      env: {},
      lookup: goodDns,
    });
    await proxy.call("echo-suffix", { pathSuffix: "/users/42" });
    expect(received[0]?.path).toBe("/base/users/42");
  });

  it("SSRFError when DNS returns a private IP", async () => {
    const repo = new ServicesRepo(`
services:
  - name: rebind
    url: http://rebind.test/endpoint
    method: GET
    auth: { mode: none }
`);
    const proxy = new UndiciServiceProxy({ repo, env: {}, lookup: goodDns });
    await expect(proxy.call("rebind", {})).rejects.toBeInstanceOf(SSRFError);
  });

  it("SSRFError when DNS returns the cloud metadata IP", async () => {
    const repo = new ServicesRepo(`
services:
  - name: meta
    url: http://metadata.test/latest
    method: GET
    auth: { mode: none }
`);
    const proxy = new UndiciServiceProxy({ repo, env: {}, lookup: goodDns });
    await expect(proxy.call("meta", {})).rejects.toBeInstanceOf(SSRFError);
  });

  it("throws 500-equivalent when auth env is missing", async () => {
    const repo = new ServicesRepo(yamlFor(port));
    const proxy = new UndiciServiceProxy({
      repo,
      env: {} /* no ECHO_TOKEN */,
      lookup: goodDns,
    });
    await expect(proxy.call("echo-bearer", { body: {} })).rejects.toThrow(/credential/i);
  });

  it("404-equivalent when service name is unknown", async () => {
    const repo = new ServicesRepo(yamlFor(port));
    const proxy = new UndiciServiceProxy({ repo, env: {}, lookup: goodDns });
    await expect(proxy.call("nope", {})).rejects.toThrow(/unknown service/i);
  });
});
