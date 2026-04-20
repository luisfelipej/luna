import { describe, expect, it } from "bun:test";
import type { BackendConfig } from "../../../src/entities/backend-config.ts";
import type { StreamChunk } from "../../../src/entities/stream-chunk.ts";
import { ClaudeCodeBackend } from "../../../src/infra/backends/claude-code-backend.ts";
import { FakeSpawn } from "../../helpers/fakes/fake-spawn.ts";

const CFG: BackendConfig = {
  model: "sonnet",
  timeoutS: 300,
  budgetUsd: 0,
  contextWindow: 200_000,
};

async function drain(iter: AsyncIterable<StreamChunk>): Promise<StreamChunk[]> {
  const out: StreamChunk[] = [];
  for await (const x of iter) out.push(x);
  return out;
}

function seed(fs: FakeSpawn, lines: string[]) {
  queueMicrotask(() => {
    const call = fs.last;
    if (!call) return;
    for (const line of lines) call.emitStdoutLine(line);
    call.finish(0);
  });
}

describe("ClaudeCodeBackend", () => {
  it("spawns `claude` with stream-json + model args and pumps chunks", async () => {
    const fs = new FakeSpawn();
    const backend = new ClaudeCodeBackend({ spawn: fs.spawn });
    seed(fs, [
      JSON.stringify({
        type: "assistant",
        message: { content: [{ type: "text", text: "hi" }] },
      }),
      JSON.stringify({
        type: "result",
        session_id: "sid-1",
        total_cost_usd: 0.01,
        duration_ms: 5,
      }),
    ]);
    const chunks = await drain(backend.send(42, "hey", CFG, new AbortController().signal));

    expect(fs.calls.length).toBe(1);
    const call = fs.calls[0];
    expect(call?.command).toBe("claude");
    expect(call?.args).toContain("--output-format");
    expect(call?.args).toContain("stream-json");
    expect(call?.args).toContain("--input-format");
    expect(call?.args).toContain("--model");
    expect(call?.args).toContain("sonnet");
    expect(chunks[chunks.length - 1]?.done).toBe(true);
    expect(chunks[chunks.length - 1]?.response?.sessionId).toBe("sid-1");
  });

  it("forwards the user prompt on stdin as stream-json", async () => {
    const fs = new FakeSpawn();
    const backend = new ClaudeCodeBackend({ spawn: fs.spawn });
    seed(fs, [
      JSON.stringify({
        type: "result",
        session_id: "s",
        total_cost_usd: 0,
        duration_ms: 0,
      }),
    ]);
    await drain(backend.send(1, "hello world", CFG, new AbortController().signal));
    const writes = fs.calls[0]?.stdinWrites ?? [];
    expect(writes.length).toBeGreaterThan(0);
    const payload = JSON.parse(writes.join("").trim());
    expect(payload.type).toBe("user");
    expect(payload.message.content).toBe("hello world");
  });

  it("passes --resume <sid> when resumeSessionId returns a string", async () => {
    const fs = new FakeSpawn();
    const backend = new ClaudeCodeBackend({
      spawn: fs.spawn,
      resumeSessionId: () => "prev-sid",
    });
    seed(fs, [
      JSON.stringify({ type: "result", session_id: "s", total_cost_usd: 0, duration_ms: 0 }),
    ]);
    await drain(backend.send(1, "hi", CFG, new AbortController().signal));
    expect(fs.calls[0]?.args).toContain("--resume");
    expect(fs.calls[0]?.args).toContain("prev-sid");
  });

  it("kills the subprocess on AbortSignal", async () => {
    const fs = new FakeSpawn();
    const backend = new ClaudeCodeBackend({ spawn: fs.spawn });
    const ctrl = new AbortController();
    // Don't finish the process; drive abort mid-stream.
    const iter = backend.send(1, "hi", CFG, ctrl.signal);
    // Kick off iteration in a microtask.
    const pending = drain(iter);
    // Allow spawn to occur.
    await Promise.resolve();
    ctrl.abort();
    await pending.catch(() => undefined);
    expect(fs.calls[0]?.killed).toBe("SIGTERM");
  });

  it("isAlive reflects an in-flight subprocess", async () => {
    const fs = new FakeSpawn();
    const backend = new ClaudeCodeBackend({ spawn: fs.spawn });
    seed(fs, [
      JSON.stringify({ type: "result", session_id: "s", total_cost_usd: 0, duration_ms: 0 }),
    ]);
    await drain(backend.send(99, "hi", CFG, new AbortController().signal));
    // After drain, backend removed the entry on finally.
    expect(backend.isAlive(99)).toBe(false);
  });
});
