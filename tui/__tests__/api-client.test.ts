import { describe, expect, it } from "bun:test";
import { createApiClient } from "../api-client.ts";

describe("api-client", () => {
  it("fetchSessions resolves to an array when server returns sessions", async () => {
    // Spin up a minimal mock server
    const mockServer = Bun.serve({
      port: 0,
      fetch(req) {
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
      },
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
    const mockServer = Bun.serve({
      port: 0,
      fetch(req) {
        receivedAuth = req.headers.get("authorization") ?? "";
        return Response.json([]);
      },
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
    const mockServer = Bun.serve({
      port: 0,
      fetch() {
        return new Response("Unauthorized", { status: 401 });
      },
    });

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
});
