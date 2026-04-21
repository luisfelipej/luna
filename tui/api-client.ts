/**
 * Typed HTTP client for Luna's monitoring API.
 * Reads LUNA_API_URL and LUNA_API_SECRET from env when not provided explicitly.
 */

export interface SessionRow {
  chat_id: number;
  session_id: string | null;
  model: string;
  total_cost_usd: number;
  last_used_at: string; // ISO 8601
}

export interface WorkspaceRow {
  chat_id: number;
  path: string;
  added_at: string; // ISO 8601
  last_used_at: string | null; // ISO 8601
}

export interface SettingsEntry {
  key: string;
  value: string;
}

export interface WebhookEndpoint {
  name: string;
  enabled: boolean;
  last_event_at: string | null; // ISO 8601
}

export interface WebhookStatus {
  running: boolean;
  port: number | null;
  endpoints: WebhookEndpoint[];
}

export interface JobRow {
  id: number;
  chat_id: number;
  name: string;
  job_type: string;
  prompt: string;
  schedule: unknown;
  active: boolean;
  auto_remove: boolean;
  fired_at: string | null; // ISO 8601
  created_at: string; // ISO 8601
}

export interface ApiClientOptions {
  /** Base URL for the Luna server, e.g. "http://localhost:8080" */
  baseUrl: string;
  /** Bearer token — same value as GENERIC_WEBHOOK_SECRET on the server */
  secret: string;
  /** Telegram chat ID — appended as ?chat_id=X to per-chat endpoints */
  chatId: number;
}

export interface ApiClient {
  fetchSessions(): Promise<SessionRow[]>;
  fetchWorkspaces(): Promise<WorkspaceRow[]>;
  fetchSettings(): Promise<SettingsEntry[]>;
  fetchWebhookStatus(): Promise<WebhookStatus>;
  fetchJobs(): Promise<JobRow[]>;
}

export function createApiClient(opts: ApiClientOptions): ApiClient {
  async function apiFetch(path: string): Promise<unknown> {
    const url = `${opts.baseUrl}${path}`;
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${opts.secret}`,
        Accept: "application/json",
      },
    });
    if (!res.ok) {
      throw new Error(`Luna API ${path} returned ${res.status}: ${await res.text()}`);
    }
    return res.json();
  }

  return {
    async fetchSessions(): Promise<SessionRow[]> {
      const data = await apiFetch(`/api/sessions?chat_id=${opts.chatId}`);
      return data as SessionRow[];
    },

    async fetchWorkspaces(): Promise<WorkspaceRow[]> {
      const data = await apiFetch(`/api/workspaces?chat_id=${opts.chatId}`);
      return data as WorkspaceRow[];
    },

    async fetchSettings(): Promise<SettingsEntry[]> {
      const data = await apiFetch(`/api/settings?chat_id=${opts.chatId}`);
      return data as SettingsEntry[];
    },

    async fetchWebhookStatus(): Promise<WebhookStatus> {
      const data = await apiFetch("/api/webhook-status");
      return data as WebhookStatus;
    },

    async fetchJobs(): Promise<JobRow[]> {
      const data = await apiFetch("/api/jobs");
      return data as JobRow[];
    },
  };
}
