import { describe, expect, it } from "bun:test";
import type { BackendConfig } from "../../../src/entities/backend-config.ts";
import { FakeAgentBackend } from "../../helpers/fakes/fake-agent-backend.ts";

const CFG: BackendConfig = {
  model: "sonnet",
  timeoutS: 300,
  budgetUsd: 0,
  contextWindow: 200_000,
};

async function drain<T>(iter: AsyncIterable<T>): Promise<T[]> {
  const out: T[] = [];
  for await (const x of iter) out.push(x);
  return out;
}

describe("FakeAgentBackend", () => {
  it("replays the scripted chunk sequence", async () => {
    const backend = new FakeAgentBackend({
      script: [
        { textSoFar: "a", done: false },
        { textSoFar: "ab", done: false },
        {
          textSoFar: "abc",
          done: true,
          response: { sessionId: "s1", costUsd: 0.01, durationMs: 42 },
        },
      ],
    });
    const chunks = await drain(backend.send(1, "hi", CFG, new AbortController().signal));
    expect(chunks.map((c) => c.textSoFar)).toEqual(["a", "ab", "abc"]);
    expect(backend.calls).toEqual([{ chatId: 1, text: "hi", cfg: CFG }]);
  });

  it("throws AbortError when the signal is pre-aborted", async () => {
    const backend = new FakeAgentBackend();
    const ctrl = new AbortController();
    ctrl.abort();
    await expect(drain(backend.send(1, "hi", CFG, ctrl.signal))).rejects.toThrow("aborted");
  });

  it("tracks changeWorkspace / restart / shutdown / isAlive", async () => {
    const backend = new FakeAgentBackend();
    await drain(backend.send(7, "hi", CFG, new AbortController().signal));
    expect(backend.isAlive(7)).toBe(true);
    await backend.changeWorkspace(7, "/x");
    await backend.restart(7);
    await backend.shutdown();
    expect(backend.changeWorkspaceCalls).toEqual([{ chatId: 7, newCwd: "/x" }]);
    expect(backend.restartCalls).toEqual([7]);
    expect(backend.shutdownCalls.count).toBe(1);
    expect(backend.isAlive(7)).toBe(false);
  });
});
