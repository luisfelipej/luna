import { EchoBackend } from "../../src/infra/backends/echo-backend.ts";
import { ClaudeCodeBackend } from "../../src/infra/backends/claude-code-backend.ts";
import { FakeAgentBackend } from "../helpers/fakes/fake-agent-backend.ts";
import { FakeSpawn } from "../helpers/fakes/fake-spawn.ts";
import { runAgentBackendContract } from "./agent-backend.contract.ts";

/**
 * Contract parameterization. LUNA_E2E=1 would add a real `claude` subprocess
 * case, but it is intentionally NOT enabled here — the fake covers the
 * observable protocol, and Phase 11 handles real-claude smoke.
 */
runAgentBackendContract([
  {
    name: "EchoBackend",
    async makeBackend() {
      return { backend: new EchoBackend() };
    },
  },
  {
    name: "FakeAgentBackend",
    async makeBackend() {
      const backend = new FakeAgentBackend({
        script: [
          { textSoFar: "h", done: false },
          { textSoFar: "he", done: false },
          {
            textSoFar: "hel",
            done: true,
            response: { sessionId: "fake", costUsd: 0, durationMs: 0 },
          },
        ],
      });
      return { backend };
    },
  },
  {
    name: "ClaudeCodeBackend (FakeSpawn)",
    async makeBackend() {
      const fakeSpawn = new FakeSpawn();
      const backend = new ClaudeCodeBackend({ spawn: fakeSpawn.spawn });

      // Seed the next spawn so the first `send` produces a valid stream.
      const seedHappyPath = () => {
        // Inspect the spawn call on next tick; we install an interceptor
        // via a Proxy is overkill — instead wrap the spawn function.
      };
      // Instead of pre-seed, patch by overriding the spawn to auto-emit.
      const origSpawn = fakeSpawn.spawn.bind(fakeSpawn);
      (backend as unknown as { spawn: typeof fakeSpawn.spawn }).spawn = (cmd, args, opts) => {
        const proc = origSpawn(cmd, args, opts);
        // Drive scripted output asynchronously.
        queueMicrotask(() => {
          const call = fakeSpawn.last;
          if (!call) return;
          call.emitStdoutLine(
            JSON.stringify({
              type: "assistant",
              message: { content: [{ type: "text", text: "hi " }] },
            }),
          );
          call.emitStdoutLine(
            JSON.stringify({
              type: "assistant",
              message: { content: [{ type: "text", text: "there" }] },
            }),
          );
          call.emitStdoutLine(
            JSON.stringify({
              type: "result",
              session_id: "sid",
              total_cost_usd: 0.005,
              duration_ms: 10,
            }),
          );
          call.finish(0);
        });
        return proc;
      };

      return {
        backend,
        seedHappyPath,
        async cleanup() {
          await backend.shutdown();
        },
      };
    },
  },
]);
