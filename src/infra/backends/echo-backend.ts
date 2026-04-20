import type { AgentBackendPort } from "../../adapters/ports/agent-backend.port.ts";
import type { AgentResponse } from "../../entities/agent-response.ts";

/**
 * Phase-0 tracer backend. Returns `echo: <text>` for any input.
 * Stands in for the real Claude Code backend until Phase 5.
 */
export class EchoBackend implements AgentBackendPort {
  async send(_chatId: number, text: string): Promise<AgentResponse> {
    return { text: `echo: ${text}` };
  }
}
