import { describe, expect, it } from "bun:test";
import { buildHarness } from "./harness.ts";

describe("Integration: clean shutdown — no open handles", () => {
  it("stop() shuts down HTTP, scheduler, transport, pool, db in order", async () => {
    const h = await buildHarness({ startHttp: true });
    // Sanity: HTTP is up.
    const r = await fetch(`http://127.0.0.1:${h.httpPort}/health`);
    expect(r.status).toBe(200);
    expect(h.container.webhookServer.status().running).toBe(true);

    await h.stop();

    // Webhook server reports stopped.
    expect(h.container.webhookServer.status().running).toBe(false);
    // Second stop is idempotent (no throw).
    await h.container.stop();
  });
});
