import { describe, expect, it } from "bun:test";
import { makeResetSession } from "../../../src/usecases/reset-session.ts";
import { makeStopStream } from "../../../src/usecases/stop-stream.ts";
import { FakeAgentBackend } from "../../helpers/fakes/fake-agent-backend.ts";
import { FakeLockPort } from "../../helpers/fakes/fake-lock-port.ts";
import { FakeSessionStore } from "../../helpers/fakes/fake-session-store.ts";

describe("ResetSession", () => {
  it("clears the session row and restarts the backend", async () => {
    const session = new FakeSessionStore();
    await session.upsert({
      chatId: 1,
      sessionId: "old",
      model: "sonnet",
      totalCostUsd: 0.5,
      lastUsedAt: new Date(),
    });
    const backend = new FakeAgentBackend();
    backend.alive.add(1);
    const reset = makeResetSession({
      backend,
      sessionStore: session,
      locks: new FakeLockPort(),
    });
    await reset(1);
    expect(await session.get(1)).toBeNull();
    expect(backend.restartCalls).toEqual([1]);
  });

  it("is idempotent (no session row → no-op for store, still restarts backend)", async () => {
    const session = new FakeSessionStore();
    const backend = new FakeAgentBackend();
    const reset = makeResetSession({
      backend,
      sessionStore: session,
      locks: new FakeLockPort(),
    });
    await reset(42);
    expect(backend.restartCalls).toEqual([42]);
  });
});

describe("StopStream", () => {
  it("returns true when the registry aborts something", () => {
    const calls: number[] = [];
    const stop = makeStopStream({
      aborts: {
        abort(chatId) {
          calls.push(chatId);
          return true;
        },
      },
    });
    expect(stop(7)).toBe(true);
    expect(calls).toEqual([7]);
  });
  it("returns false when no in-flight stream for chat", () => {
    const stop = makeStopStream({ aborts: { abort: () => false } });
    expect(stop(1)).toBe(false);
  });
});
