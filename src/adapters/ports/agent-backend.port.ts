import type { BackendConfig } from "../../entities/backend-config.ts";
import type { StreamChunk } from "../../entities/stream-chunk.ts";

/**
 * Streaming interface to a per-chat agent process (Claude Code CLI in M1,
 * arbitrary backends in M2+).
 *
 * `send` yields an async iterable of StreamChunks — one per stdout frame
 * from the backend, terminated by a `done=true` chunk carrying session
 * metadata. The caller passes an `AbortSignal` for `/stop` semantics.
 *
 * `changeWorkspace`, `restart`, `shutdown`, `isAlive` are pool-level
 * operations; see BackendPool in Phase 5.
 */
export interface AgentBackendPort {
  send(
    chatId: number,
    text: string,
    cfg: BackendConfig,
    signal: AbortSignal,
  ): AsyncIterable<StreamChunk>;
  changeWorkspace(chatId: number, newCwd: string): Promise<void>;
  restart(chatId: number): Promise<void>;
  shutdown(): Promise<void>;
  isAlive(chatId: number): boolean;
}
