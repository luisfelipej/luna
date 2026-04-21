import type { Hono } from "hono";
import type { SessionStore, SessionRow } from "../../adapters/ports/session-store.port.ts";

export interface MonitoringStores {
  readonly sessionStore?: SessionStore;
}

/**
 * Mount read-only monitoring GET routes onto the bearer-authed `api` Hono sub-app.
 * Called from HonoWebhookServer.buildApp() after the api sub-app is created.
 */
export function mountMonitoringRoutes(api: Hono, stores: MonitoringStores): void {
  // GET /api/sessions — returns all session rows across all chats
  api.get("/sessions", async (c) => {
    if (!stores.sessionStore) {
      return c.json({ error: "sessionStore not configured" }, 501);
    }
    const rows = await stores.sessionStore.listAll();
    return c.json(rows.map(serializeSession));
  });
}

function serializeSession(r: SessionRow): Record<string, unknown> {
  return {
    chat_id: r.chatId,
    session_id: r.sessionId,
    model: r.model,
    total_cost_usd: r.totalCostUsd,
    last_used_at: r.lastUsedAt.toISOString(),
  };
}
