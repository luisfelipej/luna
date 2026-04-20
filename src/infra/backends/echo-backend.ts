import type { AgentBackendPort } from "../../adapters/ports/agent-backend.port.ts";
import type { BackendConfig } from "../../entities/backend-config.ts";
import type { StreamChunk } from "../../entities/stream-chunk.ts";

/**
 * Tracer / test backend. Implements the streaming AgentBackendPort by
 * yielding a single terminal chunk with `echo: <text>`. Stands in for the
 * real ClaudeCodeBackend until Phase 5.
 *
 * Chat-scoped pool methods are no-ops; `isAlive` always returns false
 * because EchoBackend holds no subprocess.
 */
export class EchoBackend implements AgentBackendPort {
  async *send(
    _chatId: number,
    text: string,
    _cfg: BackendConfig,
    _signal: AbortSignal,
  ): AsyncIterable<StreamChunk> {
    const payload = `echo: ${text}`;
    yield {
      textSoFar: payload,
      done: true,
      response: { sessionId: "echo", costUsd: 0, durationMs: 0 },
    };
  }

  async changeWorkspace(_chatId: number, _newCwd: string): Promise<void> {}
  async restart(_chatId: number): Promise<void> {}
  async shutdown(): Promise<void> {}
  isAlive(_chatId: number): boolean {
    return false;
  }
}
