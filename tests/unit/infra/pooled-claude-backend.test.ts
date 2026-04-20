import { describe, expect, it } from "bun:test";
import type { BackendConfig } from "../../../src/entities/backend-config.ts";
import type { StreamChunk } from "../../../src/entities/stream-chunk.ts";
import { BackendPool, type PooledBackend } from "../../../src/infra/backends/backend-pool.ts";
import { PooledClaudeBackend } from "../../../src/infra/backends/pooled-claude-backend.ts";
import { FakeLockPort } from "../../helpers/fakes/fake-lock-port.ts";
import { VirtualClock } from "../../helpers/virtual-clock.ts";

const CFG: BackendConfig = {
  model: "sonnet",
  timeoutS: 300,
  budgetUsd: 0,
  contextWindow: 200_000,
};

function makePooled(chatId: number, cwd: string): PooledBackend {
  return {
    chatId,
    cwd,
    sessionId: null,
    inFlight: false,
    lastActivityMs: 0,
    async dispose() {},
  };
}

async function drain<T>(i: AsyncIterable<T>): Promise<T[]> {
  const out: T[] = [];
  for await (const x of i) out.push(x);
  return out;
}

describe("PooledClaudeBackend", () => {
  it("delegates send() to pool.ensure + stream, marking busy/idle around it", async () => {
    const clock = new VirtualClock(1_000);
    const locks = new FakeLockPort();
    const pool = new BackendPool({
      clock,
      locks,
      idleTimeoutMs: 60_000,
      spawn: async (id, cwd) => makePooled(id, cwd),
    });
    const script: StreamChunk[] = [
      { textSoFar: "hi", done: false },
      {
        textSoFar: "hi!",
        done: true,
        response: { sessionId: "sid-x", costUsd: 0.01, durationMs: 4 },
      },
    ];
    const stream: (typeof script)[] = [];
    const backend = new PooledClaudeBackend({
      pool,
      locks,
      clock,
      resolveCwd: () => "/ws",
      stream: async function* (_entry, _text, _cfg, _signal) {
        for (const c of script) yield c;
        stream.push(script);
      },
    });
    const chunks = await drain(backend.send(42, "hello", CFG, new AbortController().signal));
    expect(chunks.length).toBe(2);
    expect(pool.get(42)?.sessionId).toBe("sid-x");
    expect(pool.get(42)?.inFlight).toBe(false);
  });

  it("changeWorkspace kills the pool entry", async () => {
    const clock = new VirtualClock(1);
    const locks = new FakeLockPort();
    const pool = new BackendPool({
      clock,
      locks,
      idleTimeoutMs: 60_000,
      spawn: async (id, cwd) => makePooled(id, cwd),
    });
    const backend = new PooledClaudeBackend({
      pool,
      locks,
      clock,
      resolveCwd: () => "/ws-a",
      stream: async function* () {
        yield {
          textSoFar: "x",
          done: true,
          response: { sessionId: "s", costUsd: 0, durationMs: 0 },
        };
      },
    });
    await drain(backend.send(1, "t", CFG, new AbortController().signal));
    expect(pool.get(1)).toBeDefined();
    await backend.changeWorkspace(1, "/ws-b");
    expect(pool.get(1)).toBeUndefined();
  });

  it("isAlive reflects pool membership", async () => {
    const clock = new VirtualClock(1);
    const locks = new FakeLockPort();
    const pool = new BackendPool({
      clock,
      locks,
      idleTimeoutMs: 60_000,
      spawn: async (id, cwd) => makePooled(id, cwd),
    });
    const backend = new PooledClaudeBackend({
      pool,
      locks,
      clock,
      resolveCwd: () => "/x",
      stream: async function* () {
        yield {
          textSoFar: "x",
          done: true,
          response: { sessionId: "s", costUsd: 0, durationMs: 0 },
        };
      },
    });
    expect(backend.isAlive(5)).toBe(false);
    await drain(backend.send(5, "t", CFG, new AbortController().signal));
    expect(backend.isAlive(5)).toBe(true);
  });
});
