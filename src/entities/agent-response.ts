/**
 * The agent's final reply for a single user message. Consumed by callers
 * that want the complete text plus session metadata after streaming
 * finishes.
 */
export interface AgentResponse {
  readonly text: string;
  readonly sessionId?: string;
  readonly costUsd?: number;
  readonly durationMs?: number;
}
