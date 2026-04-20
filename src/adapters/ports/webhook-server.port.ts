/**
 * HTTP server exposing `/health`, `/webhook/github`, `/webhook`, and the
 * `/api/*` REST surface. Implemented with Hono in Phase 7.
 */
export interface WebhookServerPort {
  start(port: number): Promise<void>;
  stop(): Promise<void>;
}
