import { describe, expect, it } from "bun:test";
import { createApiClient } from "../api-client.ts";

// ── Minimal mock server builder ───────────────────────────────────────────────

function makeMockServer(handler: (req: Request) => Response) {
  return Bun.serve({ port: 0, fetch: handler });
}

describe("api-client", () => {
  it("fetchSessions resolves to an array when server returns sessions", async () => {
    const mockServer = makeMockServer((req) => {
      const url = new URL(req.url);
      if (url.pathname === "/api/sessions") {
        const auth = req.headers.get("authorization");
        if (auth !== "Bearer test-secret") {
          return new Response("Unauthorized", { status: 401 });
        }
        return Response.json([
          {
            chat_id: 42,
            session_id: "sid-1",
            model: "sonnet",
            total_cost_usd: 0.5,
            last_used_at: "2025-01-01T00:00:00Z",
          },
        ]);
      }
      return new Response("Not found", { status: 404 });
    });

    try {
      const client = createApiClient({
        baseUrl: `http://127.0.0.1:${mockServer.port}`,
        secret: "test-secret",
      });

      const sessions = await client.fetchSessions();
      expect(Array.isArray(sessions)).toBe(true);
      expect(sessions.length).toBe(1);
      expect(sessions[0]?.chat_id).toBe(42);
      expect(sessions[0]?.session_id).toBe("sid-1");
      expect(sessions[0]?.model).toBe("sonnet");
    } finally {
      mockServer.stop(true);
    }
  });

  it("fetchSessions sends Authorization bearer header", async () => {
    let receivedAuth = "";
    const mockServer = makeMockServer((req) => {
      receivedAuth = req.headers.get("authorization") ?? "";
      return Response.json([]);
    });

    try {
      const client = createApiClient({
        baseUrl: `http://127.0.0.1:${mockServer.port}`,
        secret: "my-secret",
      });
      await client.fetchSessions();
      expect(receivedAuth).toBe("Bearer my-secret");
    } finally {
      mockServer.stop(true);
    }
  });

  it("fetchSessions throws on non-ok response", async () => {
    const mockServer = makeMockServer(() => new Response("Unauthorized", { status: 401 }));

    try {
      const client = createApiClient({
        baseUrl: `http://127.0.0.1:${mockServer.port}`,
        secret: "bad-secret",
      });
      await expect(client.fetchSessions()).rejects.toThrow();
    } finally {
      mockServer.stop(true);
    }
  });

  it("fetchWorkspaces resolves to an array when server returns workspaces", async () => {
    const mockServer = makeMockServer((req) => {
      const url = new URL(req.url);
      if (url.pathname === "/api/workspaces") {
        return Response.json([
          {
            chat_id: 10,
            path: "/workspaces/alpha",
            added_at: "2025-01-01T00:00:00Z",
            last_used_at: null,
          },
          {
            chat_id: 20,
            path: "/workspaces/beta",
            added_at: "2025-01-02T00:00:00Z",
            last_used_at: "2025-01-03T00:00:00Z",
          },
        ]);
      }
      return new Response("Not found", { status: 404 });
    });

    try {
      const client = createApiClient({
        baseUrl: `http://127.0.0.1:${mockServer.port}`,
        secret: "s",
      });
      const workspaces = await client.fetchWorkspaces();
      expect(Array.isArray(workspaces)).toBe(true);
      expect(workspaces.length).toBe(2);
      expect(workspaces[0]?.chat_id).toBe(10);
      expect(workspaces[0]?.path).toBe("/workspaces/alpha");
      expect(workspaces[1]?.last_used_at).toBe("2025-01-03T00:00:00Z");
    } finally {
      mockServer.stop(true);
    }
  });

  it("fetchSettings resolves to key-value array", async () => {
    const mockServer = makeMockServer((req) => {
      const url = new URL(req.url);
      if (url.pathname === "/api/settings") {
        return Response.json([
          { key: "model:42", value: "opus" },
          { key: "timeout_s:42", value: "120" },
        ]);
      }
      return new Response("Not found", { status: 404 });
    });

    try {
      const client = createApiClient({
        baseUrl: `http://127.0.0.1:${mockServer.port}`,
        secret: "s",
      });
      const settings = await client.fetchSettings();
      expect(Array.isArray(settings)).toBe(true);
      expect(settings.length).toBe(2);
      expect(settings[0]?.key).toBe("model:42");
      expect(settings[0]?.value).toBe("opus");
    } finally {
      mockServer.stop(true);
    }
  });

  it("fetchWebhookStatus resolves to status object with endpoints", async () => {
    const mockServer = makeMockServer((req) => {
      const url = new URL(req.url);
      if (url.pathname === "/api/webhook-status") {
        return Response.json({
          running: true,
          port: 8080,
          endpoints: [
            { name: "/webhook/github", enabled: true, last_event_at: null },
            { name: "/webhook", enabled: false, last_event_at: "2025-01-01T00:00:00Z" },
          ],
        });
      }
      return new Response("Not found", { status: 404 });
    });

    try {
      const client = createApiClient({
        baseUrl: `http://127.0.0.1:${mockServer.port}`,
        secret: "s",
      });
      const status = await client.fetchWebhookStatus();
      expect(status.running).toBe(true);
      expect(status.port).toBe(8080);
      expect(Array.isArray(status.endpoints)).toBe(true);
      expect(status.endpoints.length).toBe(2);
      expect(status.endpoints[0]?.name).toBe("/webhook/github");
    } finally {
      mockServer.stop(true);
    }
  });

  it("fetchJobs resolves to an array of job rows", async () => {
    const mockServer = makeMockServer((req) => {
      const url = new URL(req.url);
      if (url.pathname === "/api/jobs") {
        return Response.json([
          {
            id: 1,
            chat_id: 42,
            name: "daily-report",
            job_type: "reminder",
            prompt: "generate report",
            schedule: { kind: "daily", timesUtc: ["08:00"] },
            active: true,
            auto_remove: false,
            fired_at: null,
            created_at: "2025-01-01T00:00:00Z",
          },
        ]);
      }
      return new Response("Not found", { status: 404 });
    });

    try {
      const client = createApiClient({
        baseUrl: `http://127.0.0.1:${mockServer.port}`,
        secret: "s",
      });
      const jobs = await client.fetchJobs();
      expect(Array.isArray(jobs)).toBe(true);
      expect(jobs.length).toBe(1);
      expect(jobs[0]?.id).toBe(1);
      expect(jobs[0]?.name).toBe("daily-report");
    } finally {
      mockServer.stop(true);
    }
  });
});
