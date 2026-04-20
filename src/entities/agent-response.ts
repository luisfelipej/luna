/**
 * The agent's reply to a single user message. Phase-0 tracer shape:
 * just the final text, no streaming, no cost/session metadata yet.
 */
export interface AgentResponse {
  readonly text: string;
}
