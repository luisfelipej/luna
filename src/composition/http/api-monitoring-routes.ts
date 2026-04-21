import type { Hono } from "hono";
import type { SessionStore, SessionRow } from "../../adapters/ports/session-store.port.ts";
import type { AllowedWorkspaceStore } from "../../adapters/ports/allowed-workspace-store.port.ts";
import type { SettingsStore, SettingsEntry } from "../../adapters/ports/settings-store.port.ts";
import type { WebhookServerStatus } from "../../adapters/ports/webhook-server.port.ts";

export interface MonitoringStores {
  readonly sessionStore?: SessionStore;
  readonly allowedWorkspaceStore?: AllowedWorkspaceStore;
  readonly settingsStore?: SettingsStore;
  /** Callback that returns the current webhook server status snapshot. */
  readonly getWebhookStatus?: () => WebhookServerStatus;
}

/**
 * Mount read-only monitoring GET routes onto the bearer-authed `api` Hono sub-app.
 * Called from HonoWebhookServer.buildApp() after the api sub-app is created.
 */
export function mountMonitoringRoutes(api: Hono, stores: MonitoringStores): void {
  // GET /api/sessions?chat_id=X — returns session row for the given chat
  api.get("/sessions", async (c) => {
    const chatId = parseChatId(c.req.query("chat_id"));
    if (chatId === null) return c.json({ error: "chat_id query param required" }, 400);
    if (!stores.sessionStore) return c.json({ error: "sessionStore not configured" }, 501);
    const rows = await stores.sessionStore.listAll();
    return c.json(rows.filter((r) => r.chatId === chatId).map(serializeSession));
  });

  // GET /api/workspaces?chat_id=X — returns allowed workspaces for the given chat
  api.get("/workspaces", async (c) => {
    const chatId = parseChatId(c.req.query("chat_id"));
    if (chatId === null) return c.json({ error: "chat_id query param required" }, 400);
    if (!stores.allowedWorkspaceStore)
      return c.json({ error: "allowedWorkspaceStore not configured" }, 501);
    const rows = await stores.allowedWorkspaceStore.listAll();
    return c.json(
      rows
        .filter((w) => w.chatId === chatId)
        .map((w) => ({
          chat_id: w.chatId,
          path: w.path,
          added_at: w.addedAt.toISOString(),
          last_used_at: w.lastUsedAt ? w.lastUsedAt.toISOString() : null,
        })),
    );
  });

  // GET /api/settings?chat_id=X — returns settings entries for the given chat
  api.get("/settings", async (c) => {
    const chatId = parseChatId(c.req.query("chat_id"));
    if (chatId === null) return c.json({ error: "chat_id query param required" }, 400);
    if (!stores.settingsStore) return c.json({ error: "settingsStore not configured" }, 501);
    const [userEntries, wsEntries] = await Promise.all([
      stores.settingsStore.listPrefix(`user_config:${chatId}:`),
      stores.settingsStore.listPrefix(`ws_config:${chatId}:`),
    ]);
    const entries = [...userEntries, ...wsEntries];
    return c.json(entries.map(serializeSettings));
  });

  // GET /api/webhook-status — returns the current webhook server status
  api.get("/webhook-status", (c) => {
    if (!stores.getWebhookStatus) {
      return c.json({
        running: false,
        port: null,
        endpoints: [],
      });
    }
    const status = stores.getWebhookStatus();
    return c.json({
      running: status.running,
      port: status.port,
      endpoints: status.endpoints.map((e) => ({
        name: e.name,
        enabled: e.enabled,
        last_event_at: e.lastEventAtIso,
      })),
    });
  });
}

function parseChatId(raw: string | undefined): number | null {
  if (raw === undefined || raw === "") return null;
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : null;
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

function serializeSettings(e: SettingsEntry): Record<string, unknown> {
  return {
    key: e.key,
    value: e.value,
  };
}
