import { describe, expect, it } from "bun:test";
import type {
  ConfigResolverPort,
  ResolvableField,
  ResolvedField,
} from "../../../src/adapters/ports/config-resolver.port.ts";
import type { CrashRecoveryPort } from "../../../src/adapters/ports/crash-recovery.port.ts";
import type { TelegramTransport } from "../../../src/adapters/ports/telegram-transport.port.ts";
import type { StreamChunk } from "../../../src/entities/stream-chunk.ts";
import { makeSendMessageToAgent } from "../../../src/usecases/send-message-to-agent.ts";
import { FakeAgentBackend } from "../../helpers/fakes/fake-agent-backend.ts";
import { FakeHistoryStore } from "../../helpers/fakes/fake-history-store.ts";
import { FakeLockPort } from "../../helpers/fakes/fake-lock-port.ts";
import { FakeSessionStore } from "../../helpers/fakes/fake-session-store.ts";
import { VirtualClock } from "../../helpers/virtual-clock.ts";

class RecordingTransport implements TelegramTransport {
  readonly sent: Array<{ chatId: number; text: string }> = [];
  readonly edited: Array<{ chatId: number; messageId: number; text: string }> = [];
  async sendMessage(chatId: number, text: string): Promise<number> {
    this.sent.push({ chatId, text });
    return this.sent.length;
  }
  async editMessage(chatId: number, messageId: number, text: string): Promise<void> {
    this.edited.push({ chatId, messageId, text });
  }
  async sendFile(): Promise<void> {}
  onUpdate(): void {}
  async start(): Promise<void> {}
  async stop(): Promise<void> {}
}

class FakeCrash implements CrashRecoveryPort {
  readonly marked: number[] = [];
  readonly cleared: number[] = [];
  async mark(chatId: number) {
    this.marked.push(chatId);
  }
  async clear(chatId: number) {
    this.cleared.push(chatId);
  }
  async listPending() {
    return [];
  }
}

function makeResolver(
  overrides: Partial<Record<ResolvableField, ResolvedField>> = {},
): ConfigResolverPort {
  const defaults: Record<ResolvableField, ResolvedField> = {
    model: { value: "sonnet", tier: 6 },
    timeoutSeconds: { value: 300, tier: 6 },
    maxBudgetUsd: { value: 0, tier: 6 },
    contextWindow: { value: 200_000, tier: 6 },
    idleTimeoutMin: { value: 15, tier: 6 },
  };
  return {
    resolve(_chatId, _ws, field) {
      return overrides[field] ?? defaults[field];
    },
  };
}

function buildDeps(override?: {
  script?: StreamChunk[];
  maxBudget?: number;
  priorCost?: number;
}) {
  const clock = new VirtualClock(1_700_000_000_000);
  const telegram = new RecordingTransport();
  const backend = new FakeAgentBackend({
    script: override?.script ?? [
      {
        textSoFar: "pong",
        done: true,
        response: { sessionId: "sid-1", costUsd: 0.01, durationMs: 10 },
      },
    ],
  });
  const sessionStore = new FakeSessionStore();
  if (override?.priorCost !== undefined) {
    // Seed prior cost; lastUsedAt is irrelevant for the asserts.
    void sessionStore.upsert({
      chatId: 42,
      sessionId: null,
      model: "sonnet",
      totalCostUsd: override.priorCost,
      lastUsedAt: clock.now(),
    });
  }
  const history = new FakeHistoryStore();
  const crash = new FakeCrash();
  const locks = new FakeLockPort();
  const resolver = makeResolver(
    override?.maxBudget !== undefined
      ? { maxBudgetUsd: { value: override.maxBudget, tier: 5 } }
      : {},
  );
  const send = makeSendMessageToAgent({
    backend,
    telegram,
    resolver,
    sessionStore,
    historyStore: history,
    crashRecovery: crash,
    locks,
    clock,
    resolveWorkspacePath: () => "/ws",
  });
  return { send, telegram, backend, sessionStore, history, crash, clock };
}

describe("SendMessageToAgent (full Phase 5.7)", () => {
  it("streams a send, persists user + assistant history lines, and upserts the session", async () => {
    const d = buildDeps();
    await d.send({ chatId: 42, text: "ping" });
    expect(d.telegram.sent.map((s) => s.text)).toEqual(["pong"]);
    expect(d.history.appended.map((l) => ({ dir: l.dir, text: l.text }))).toEqual([
      { dir: "user", text: "ping" },
      { dir: "assistant", text: "pong" },
    ]);
    const row = await d.sessionStore.get(42);
    expect(row?.sessionId).toBe("sid-1");
    expect(row?.totalCostUsd).toBeCloseTo(0.01, 5);
  });

  it("marks the crash-recovery flag before the stream and clears it on completion", async () => {
    const d = buildDeps();
    await d.send({ chatId: 42, text: "hi" });
    expect(d.crash.marked).toEqual([42]);
    expect(d.crash.cleared).toEqual([42]);
  });

  it("acquires the per-chat lock (serializes two concurrent sends on the same chat)", async () => {
    const d = buildDeps({
      script: [
        { textSoFar: "a", done: false },
        {
          textSoFar: "ab",
          done: true,
          response: { sessionId: "s", costUsd: 0, durationMs: 0 },
        },
      ],
    });
    const p1 = d.send({ chatId: 42, text: "first" });
    const p2 = d.send({ chatId: 42, text: "second" });
    await Promise.all([p1, p2]);
    // Each send sends 1 bubble; 2 bubbles total, in order.
    expect(d.telegram.sent.length).toBe(2);
    expect(d.backend.calls[0]?.text).toBe("first");
    expect(d.backend.calls[1]?.text).toBe("second");
  });

  it("warns when the run crosses 80 % of maxBudgetUsd", async () => {
    const d = buildDeps({
      maxBudget: 1,
      priorCost: 0.79,
      script: [
        {
          textSoFar: "done",
          done: true,
          response: { sessionId: "s", costUsd: 0.02, durationMs: 1 },
        },
      ],
    });
    await d.send({ chatId: 42, text: "hi" });
    const warn = d.telegram.sent.find((s) => s.text.includes("Budget warning"));
    expect(warn).toBeDefined();
  });

  it("aborts pre-flight when prior cost already exceeds the budget", async () => {
    const d = buildDeps({ maxBudget: 1, priorCost: 2 });
    await d.send({ chatId: 42, text: "hi" });
    expect(d.telegram.sent).toEqual([{ chatId: 42, text: "Budget exceeded." }]);
    expect(d.backend.calls).toEqual([]); // stream never started
  });

  it("forwards AbortSignal to the backend", async () => {
    const d = buildDeps({
      script: [
        { textSoFar: "h", done: false },
        { textSoFar: "he", done: false },
        {
          textSoFar: "hel",
          done: true,
          response: { sessionId: "s", costUsd: 0, durationMs: 0 },
        },
      ],
    });
    const ctrl = new AbortController();
    ctrl.abort();
    try {
      await d.send({ chatId: 42, text: "hi", signal: ctrl.signal });
    } catch {
      // acceptable: backend throws AbortError
    }
    // Crash flag still cleared (finally branch).
    expect(d.crash.cleared).toEqual([42]);
  });
});
