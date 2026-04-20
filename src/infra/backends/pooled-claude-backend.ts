import type { AgentBackendPort } from "../../adapters/ports/agent-backend.port.ts";
import type { ClockPort } from "../../adapters/ports/clock.port.ts";
import type { LockPort } from "../../adapters/ports/lock.port.ts";
import type { BackendConfig } from "../../entities/backend-config.ts";
import type { StreamChunk } from "../../entities/stream-chunk.ts";
import type { BackendPool, PooledBackend } from "./backend-pool.ts";

export interface PooledClaudeBackendDeps {
  readonly pool: BackendPool;
  readonly locks: LockPort;
  readonly clock: ClockPort;
  /**
   * Returns the cwd for a given chat. Normally resolved via WorkspaceHistoryStore;
   * tests hand in a plain function.
   */
  readonly resolveCwd: (chatId: number) => Promise<string> | string;
  /**
   * Wraps a pooled backend's spawn into the AgentBackendPort.send shape. The
   * composition root binds this to ClaudeCodeBackend.send; tests can bind to
   * FakeAgentBackend.
   */
  readonly stream: (
    entry: PooledBackend,
    text: string,
    cfg: BackendConfig,
    signal: AbortSignal,
  ) => AsyncIterable<StreamChunk>;
}

/**
 * AgentBackendPort adapter that multiplexes over BackendPool entries.
 *
 * - `send`: acquire the per-chat lock, ensure a pooled entry, mark busy,
 *   stream; markIdle + stamp activity on finally.
 * - `changeWorkspace` / `restart`: acquire the lock and dispose the entry.
 * - `shutdown`: delegate to pool.shutdown.
 * - `isAlive`: pool membership check.
 */
export class PooledClaudeBackend implements AgentBackendPort {
  constructor(private readonly deps: PooledClaudeBackendDeps) {}

  async *send(
    chatId: number,
    text: string,
    cfg: BackendConfig,
    signal: AbortSignal,
  ): AsyncIterable<StreamChunk> {
    const cwd = await this.deps.resolveCwd(chatId);
    // Ensure the entry under the per-chat lock so spawn/evict cannot race.
    const entry = await this.deps.locks.withLock(chatId, () => this.deps.pool.ensure(chatId, cwd));
    this.deps.pool.markBusy(chatId);
    try {
      for await (const chunk of this.deps.stream(entry, text, cfg, signal)) {
        this.deps.pool.stampActivity(chatId);
        if (chunk.done && chunk.response?.sessionId) {
          entry.sessionId = chunk.response.sessionId;
        }
        yield chunk;
      }
    } finally {
      this.deps.pool.markIdle(chatId);
    }
  }

  async changeWorkspace(chatId: number, _newCwd: string): Promise<void> {
    await this.deps.locks.withLock(chatId, () => this.deps.pool.kill(chatId));
  }

  async restart(chatId: number): Promise<void> {
    await this.deps.locks.withLock(chatId, () => this.deps.pool.kill(chatId));
  }

  async shutdown(): Promise<void> {
    await this.deps.pool.shutdown();
  }

  isAlive(chatId: number): boolean {
    return this.deps.pool.get(chatId) !== undefined;
  }
}
