import type { AgentResponse } from "../../entities/agent-response.ts";

/**
 * Phase-0 tracer shape: non-streaming one-shot call.
 * Replaced by the streaming AsyncIterable shape in Phase 2.
 */
export interface AgentBackendPort {
  send(chatId: number, text: string): Promise<AgentResponse>;
}
