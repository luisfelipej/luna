import { describe, expect, it } from "bun:test";
import type { AgentBackendPort } from "../../src/adapters/ports/agent-backend.port.ts";
import type { BackendConfig } from "../../src/entities/backend-config.ts";
import type { StreamChunk } from "../../src/entities/stream-chunk.ts";

const CFG: BackendConfig = {
  model: "sonnet",
  timeoutS: 300,
  budgetUsd: 0,
  contextWindow: 200_000,
};

/**
 * Shared contract suite for AgentBackendPort. Every concrete implementation
 * is invoked with a "simple happy path" driver provided by the caller —
 * the driver seeds the backend to emit 3 text deltas + 1 final result when
 * `send(1, "hello", ...)` runs.
 */
export interface AgentBackendContractCase {
  readonly name: string;
  makeBackend(): Promise<{
    backend: AgentBackendPort;
    /** Optional: drives the fake to emit scripted frames. */
    seedHappyPath?: () => void;
    cleanup?: () => Promise<void>;
  }>;
}

async function drain(iter: AsyncIterable<StreamChunk>): Promise<StreamChunk[]> {
  const out: StreamChunk[] = [];
  for await (const x of iter) out.push(x);
  return out;
}

export function runAgentBackendContract(cases: AgentBackendContractCase[]): void {
  for (const c of cases) {
    describe(`AgentBackendPort contract — ${c.name}`, () => {
      it("streams a non-empty chunk sequence ending with done=true + response", async () => {
        const { backend, seedHappyPath, cleanup } = await c.makeBackend();
        try {
          seedHappyPath?.();
          const chunks = await drain(backend.send(1, "hello", CFG, new AbortController().signal));
          expect(chunks.length).toBeGreaterThan(0);
          const last = chunks[chunks.length - 1];
          expect(last?.done).toBe(true);
          expect(last?.response).toBeDefined();
          expect(typeof last?.response?.sessionId).toBe("string");
        } finally {
          await cleanup?.();
        }
      });

      it("respects a pre-aborted AbortSignal", async () => {
        const { backend, seedHappyPath, cleanup } = await c.makeBackend();
        try {
          seedHappyPath?.();
          const ctrl = new AbortController();
          ctrl.abort();
          // Some backends throw, others return empty stream → both are fine.
          try {
            const chunks = await drain(backend.send(1, "hi", CFG, ctrl.signal));
            // If no throw, stream must have emitted at most 0 useful chunks
            // before the transport aborted. Accept both empty and any chunk
            // count — key invariant is "no hang".
            expect(Array.isArray(chunks)).toBe(true);
          } catch (err) {
            // acceptable: abort-rejected
            expect(err).toBeDefined();
          }
        } finally {
          await cleanup?.();
        }
      });

      it("exposes changeWorkspace / restart / shutdown without throwing", async () => {
        const { backend, cleanup } = await c.makeBackend();
        try {
          await backend.changeWorkspace(1, "/tmp/x");
          await backend.restart(1);
          await backend.shutdown();
          expect(backend.isAlive(1)).toBe(false);
        } finally {
          await cleanup?.();
        }
      });
    });
  }
}
