/**
 * A single streamed snippet of an agent response. Emitted by the backend as
 * the model produces tokens.
 *
 * `textSoFar` is the cumulative assistant text — the transport re-renders
 * this entire string on every leading-edge edit window. `done=true` carries
 * the final snapshot plus terminal metadata (session id, cost, duration).
 */
export interface StreamChunk {
  readonly textSoFar: string;
  readonly done: boolean;
  readonly response?: {
    readonly sessionId: string;
    readonly costUsd: number;
    readonly durationMs: number;
  };
}
