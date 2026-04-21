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

export interface ApiClientOptions {
  /** Base URL for the Luna server, e.g. "http://localhost:8080" */
  baseUrl: string;
  /** Bearer token — same value as GENERIC_WEBHOOK_SECRET on the server */
  secret: string;
}

export interface ApiClient {
  fetchSessions(): Promise<SessionRow[]>;
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
      const data = await apiFetch("/api/sessions");
      return data as SessionRow[];
    },
  };
}
