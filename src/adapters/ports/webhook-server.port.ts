/**
 * HTTP server exposing `/health`, `/webhook/github`, `/webhook`, and the
 * `/api/*` REST surface. Implemented with Hono + `Bun.serve` in Phase 7.
 */

/** Per-endpoint status, consumed by the Telegram `/webhooks` command. */
export interface WebhookEndpointStatus {
  readonly name: string;
  readonly enabled: boolean;
  readonly lastEventAtIso: string | null;
}

export interface WebhookServerStatus {
  readonly running: boolean;
  readonly port: number | null;
  readonly endpoints: readonly WebhookEndpointStatus[];
}

export interface WebhookServerPort {
  start(port: number): Promise<void>;
  stop(): Promise<void>;
  /** Live snapshot; used by presenter for `/webhooks`. */
  status(): WebhookServerStatus;
}
