import type { AgentBackendPort } from "../adapters/ports/agent-backend.port.ts";
import type { ClockPort } from "../adapters/ports/clock.port.ts";
import type { ConfigResolverPort } from "../adapters/ports/config-resolver.port.ts";
import type { CrashRecoveryPort } from "../adapters/ports/crash-recovery.port.ts";
import type { HistoryStore } from "../adapters/ports/history-store.port.ts";
import type { LockPort } from "../adapters/ports/lock.port.ts";
import type { LoggerPort } from "../adapters/ports/logger.port.ts";
import type { SessionStore } from "../adapters/ports/session-store.port.ts";
import type { TelegramTransport } from "../adapters/ports/telegram-transport.port.ts";
import type { BackendConfig, Model } from "../entities/backend-config.ts";
import type { StreamChunk } from "../entities/stream-chunk.ts";
import { evaluateBudget } from "./guards/assert-budget.ts";
import { sendWithMarkdownFallback } from "./stream/markdown-fallback.ts";
import { makeStreamEventThrottle, type ThrottleEmit } from "./stream/stream-event-throttle.ts";

/**
 * Full Phase 5.7 SendMessageToAgent. Replaces the Phase 0 tracer shape.
 *
 * Flow (per sdd/luna/design "Data Flow — Inbound Telegram message"):
 *   1. Acquire per-chat lock (LockPort).
 *   2. Resolve BackendConfig via the six-tier resolver.
 *   3. Pre-flight budget check (`evaluateBudget` on prior spend alone); an
 *      overflow before the stream starts is still an exceeded outcome.
 *   4. Mark crash-recovery flag BEFORE the first stream chunk.
 *   5. Append the user line to the per-chat JSONL.
 *   6. Stream via AgentBackendPort, pump chunks through StreamEventThrottle,
 *      feed emits to Telegram (with MarkdownFallback).
 *   7. On terminal chunk: persist assistant line + upsert SessionStore + clear
 *      crash-recovery flag.
 *   8. Budget post-check: warn at ≥ 80% of the configured max; throw
 *      RateLimitError if the running total exceeded the max.
 *   9. /stop semantics: caller passes an AbortSignal via the optional
 *      `signal` param; the stream is killed mid-flight. The lock still
 *      releases cleanly (try/finally).
 */
export interface SendMessageToAgentDeps {
  readonly backend: AgentBackendPort;
  readonly telegram: TelegramTransport;
  readonly resolver: ConfigResolverPort;
  readonly sessionStore: SessionStore;
  readonly historyStore: HistoryStore;
  readonly crashRecovery: CrashRecoveryPort;
  readonly locks: LockPort;
  readonly clock: ClockPort;
  readonly logger?: LoggerPort;
  /**
   * How to look up the chat's current workspace path (consulted by the
   * resolver). Usually `workspaceHistoryStore.get` bound in composition.
   */
  readonly resolveWorkspacePath: (chatId: number) => Promise<string> | string;
  /** Optional override for the 2000ms throttle window (tests). */
  readonly throttleWindowMs?: number;
}

export interface SendMessageToAgentCall {
  readonly chatId: number;
  readonly text: string;
  readonly signal?: AbortSignal;
}

export function makeSendMessageToAgent(deps: SendMessageToAgentDeps) {
  return async function sendMessageToAgent(call: SendMessageToAgentCall): Promise<void> {
    const { chatId, text } = call;
    const externalSignal = call.signal;

    await deps.locks.withLock(chatId, async () => {
      const wsPath = await deps.resolveWorkspacePath(chatId);
      const cfg = resolveBackendConfig(deps, chatId, wsPath);

      const prior = await deps.sessionStore.get(chatId);
      const priorCost = prior?.totalCostUsd ?? 0;
      // Pre-flight — reject if already over budget.
      const preFlight = evaluateBudget({
        priorUsd: priorCost,
        deltaUsd: 0,
        maxBudgetUsd: cfg.budgetUsd,
      });
      if (preFlight.kind === "exceeded") {
        await deps.telegram.sendMessage(chatId, "Budget exceeded.");
        return;
      }

      const ctrl = new AbortController();
      if (externalSignal) {
        if (externalSignal.aborted) ctrl.abort();
        else externalSignal.addEventListener("abort", () => ctrl.abort(), { once: true });
      }

      await deps.crashRecovery.mark(chatId);
      await deps.historyStore.append(chatId, {
        chatId,
        text,
        dir: "user",
        ts: deps.clock.now().toISOString(),
      });

      let messageId: number | null = null;
      let lastText = "";
      const finalBox: { chunk: StreamChunk | null } = { chunk: null };

      const emit = async (e: ThrottleEmit): Promise<void> => {
        if (e.kind === "send") {
          messageId = await sendWithMarkdownFallback(e.text, ({ html, body }) =>
            deps.telegram.sendMessage(chatId, body, { html }),
          );
          lastText = e.text;
          return;
        }
        if (messageId === null) {
          // Defensive: throttle contract always sends before edits.
          messageId = await sendWithMarkdownFallback(e.text, ({ html, body }) =>
            deps.telegram.sendMessage(chatId, body, { html }),
          );
          lastText = e.text;
          return;
        }
        const mid = messageId;
        await sendWithMarkdownFallback<void>(e.text, ({ html, body }) =>
          deps.telegram.editMessage(chatId, mid, body, { html }),
        );
        lastText = e.text;
      };

      const throttle = makeStreamEventThrottle({
        clock: deps.clock,
        emit,
        ...(deps.throttleWindowMs !== undefined ? { windowMs: deps.throttleWindowMs } : {}),
      });

      const stream = deps.backend.send(chatId, text, cfg, ctrl.signal);
      const observed = tapFinalChunk(stream, (c) => {
        finalBox.chunk = c;
      });

      try {
        await throttle(observed);
      } catch (err) {
        deps.logger?.error("send: backend stream failed", {
          chatId,
          err: String(err),
        });
        throw err;
      } finally {
        // History + session persist + crash flag clear are post-stream
        // regardless of abort; see spec #49 crash-recovery scenarios.
        if (lastText !== "") {
          await deps.historyStore.append(chatId, {
            chatId,
            text: lastText,
            dir: "assistant",
            ts: deps.clock.now().toISOString(),
          });
        }
        if (finalBox.chunk?.response) {
          const resp = finalBox.chunk.response;
          await deps.sessionStore.upsert({
            chatId,
            sessionId: resp.sessionId,
            model: cfg.model,
            totalCostUsd: priorCost + resp.costUsd,
            lastUsedAt: deps.clock.now(),
          });
        }
        await deps.crashRecovery.clear(chatId);
      }

      if (finalBox.chunk?.response) {
        const outcome = evaluateBudget({
          priorUsd: priorCost,
          deltaUsd: finalBox.chunk.response.costUsd,
          maxBudgetUsd: cfg.budgetUsd,
        });
        if (outcome.kind === "warn") {
          await deps.telegram.sendMessage(
            chatId,
            `Budget warning: $${outcome.totalUsd.toFixed(2)} of $${outcome.maxUsd.toFixed(2)}.`,
          );
        } else if (outcome.kind === "exceeded") {
          await deps.telegram.sendMessage(chatId, "Budget exceeded.");
        }
      }
    });
  };
}

export type SendMessageToAgent = ReturnType<typeof makeSendMessageToAgent>;

async function* tapFinalChunk(
  source: AsyncIterable<StreamChunk>,
  sink: (c: StreamChunk) => void,
): AsyncIterable<StreamChunk> {
  for await (const chunk of source) {
    if (chunk.done) sink(chunk);
    yield chunk;
  }
}

/**
 * Reduce the six-tier resolver's per-field lookups into a BackendConfig. Each
 * field has a hard default anchored at tier 6, so this never throws unless
 * the resolver itself is misconfigured (returns null for a known field).
 */
function resolveBackendConfig(
  deps: SendMessageToAgentDeps,
  chatId: number,
  wsPath: string,
): BackendConfig {
  const model = must(deps.resolver.resolve(chatId, wsPath, "model"), "model") as Model;
  const timeoutS = mustNum(
    deps.resolver.resolve(chatId, wsPath, "timeoutSeconds"),
    "timeoutSeconds",
  );
  const budgetUsd = mustNum(deps.resolver.resolve(chatId, wsPath, "maxBudgetUsd"), "maxBudgetUsd");
  const contextWindow = mustNum(
    deps.resolver.resolve(chatId, wsPath, "contextWindow"),
    "contextWindow",
  );
  return { model, timeoutS, budgetUsd, contextWindow };
}

function must<T extends { value: string | number }>(v: T | null, field: string): string | number {
  if (!v) throw new Error(`resolver: missing ${field}`);
  return v.value;
}
function mustNum<T extends { value: string | number }>(v: T | null, field: string): number {
  const raw = must(v, field);
  if (typeof raw !== "number") throw new Error(`resolver: ${field} not a number`);
  return raw;
}
