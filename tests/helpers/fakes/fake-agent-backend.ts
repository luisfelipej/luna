import type { AgentBackendPort } from "../../../src/adapters/ports/agent-backend.port.ts";
import type { BackendConfig } from "../../../src/entities/backend-config.ts";
import type { StreamChunk } from "../../../src/entities/stream-chunk.ts";

export type FakeAgentScript = readonly StreamChunk[];

export interface FakeAgentBackendOptions {
  readonly script?: FakeAgentScript;
  /** Per-chunk delay, invoked before each yield. Lets tests interleave clock ticks. */
  readonly beforeEach?: (i: number) => Promise<void> | void;
}

/**
 * In-memory AgentBackendPort fake that replays a scripted sequence of
 * StreamChunks. Used by SendMessageToAgent, StreamEventThrottle, and pool
 * contract tests.
 */
export class FakeAgentBackend implements AgentBackendPort {
  readonly calls: Array<{ chatId: number; text: string; cfg: BackendConfig }> = [];
  readonly changeWorkspaceCalls: Array<{ chatId: number; newCwd: string }> = [];
  readonly restartCalls: number[] = [];
  readonly shutdownCalls: { count: number } = { count: 0 };
  readonly alive = new Set<number>();

  constructor(private readonly opts: FakeAgentBackendOptions = {}) {}

  async *send(
    chatId: number,
    text: string,
    cfg: BackendConfig,
    signal: AbortSignal,
  ): AsyncIterable<StreamChunk> {
    this.calls.push({ chatId, text, cfg });
    this.alive.add(chatId);
    const script = this.opts.script ?? [
      {
        textSoFar: `fake: ${text}`,
        done: true,
        response: { sessionId: "fake", costUsd: 0, durationMs: 0 },
      },
    ];
    for (let i = 0; i < script.length; i++) {
      if (signal.aborted) {
        const err = new Error("aborted");
        err.name = "AbortError";
        throw err;
      }
      if (this.opts.beforeEach) await this.opts.beforeEach(i);
      const chunk = script[i];
      if (chunk === undefined) continue;
      yield chunk;
    }
  }

  async changeWorkspace(chatId: number, newCwd: string): Promise<void> {
    this.changeWorkspaceCalls.push({ chatId, newCwd });
  }

  async restart(chatId: number): Promise<void> {
    this.restartCalls.push(chatId);
  }

  async shutdown(): Promise<void> {
    this.shutdownCalls.count++;
    this.alive.clear();
  }

  isAlive(chatId: number): boolean {
    return this.alive.has(chatId);
  }
}
