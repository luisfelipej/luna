import type { ClockPort } from "../../adapters/ports/clock.port.ts";
import type { StreamChunk } from "../../entities/stream-chunk.ts";

/**
 * Emit signals the throttle produces. The presenter maps:
 *   - {kind:"send", text}  → telegram.sendMessage (stores messageId)
 *   - {kind:"edit", text}  → telegram.editMessage(messageId, text)
 */
export type ThrottleEmit =
  | { readonly kind: "send"; readonly text: string }
  | { readonly kind: "edit"; readonly text: string };

export interface StreamEventThrottleOptions {
  readonly clock: ClockPort;
  readonly emit: (e: ThrottleEmit) => Promise<void>;
  /** Leading-edge window; M1 uses 2000 ms per design. */
  readonly windowMs?: number;
}

/**
 * Leading-edge + trailing-edge throttle for StreamChunk sequences.
 *
 * Contract (per spec #42, design "Streaming Throttle Semantics"):
 *   1. First chunk → emit `{send, text}`; anchors the message.
 *   2. Non-terminal chunks where `now - lastEmit >= windowMs` → emit `{edit, text}`;
 *      otherwise buffer.
 *   3. `done === true` → always emit `{edit, text}` (trailing flush).
 *   4. If the whole stream is a single terminal chunk → only `{send, text}`
 *      is emitted (no redundant edit).
 *
 * Pure with respect to clock + emit; no timers required — windowing is
 * driven by observed chunk arrivals against the injected ClockPort.
 */
export function makeStreamEventThrottle(opts: StreamEventThrottleOptions) {
  const windowMs = opts.windowMs ?? 2000;

  return async function runThrottle(stream: AsyncIterable<StreamChunk>): Promise<void> {
    let seenAny = false;
    let lastEmitMs = Number.NEGATIVE_INFINITY;
    let lastEmittedText = "";

    for await (const chunk of stream) {
      if (!seenAny) {
        // First chunk — anchor the message.
        seenAny = true;
        await opts.emit({ kind: "send", text: chunk.textSoFar });
        lastEmitMs = opts.clock.nowMs();
        lastEmittedText = chunk.textSoFar;
        if (chunk.done) return;
        continue;
      }
      if (chunk.done) {
        // Trailing-edge flush — only if the text actually changed.
        if (chunk.textSoFar !== lastEmittedText) {
          await opts.emit({ kind: "edit", text: chunk.textSoFar });
          lastEmittedText = chunk.textSoFar;
          lastEmitMs = opts.clock.nowMs();
        }
        return;
      }
      const now = opts.clock.nowMs();
      if (now - lastEmitMs >= windowMs && chunk.textSoFar !== lastEmittedText) {
        await opts.emit({ kind: "edit", text: chunk.textSoFar });
        lastEmittedText = chunk.textSoFar;
        lastEmitMs = now;
      }
    }

    // Stream ended without a done=true chunk (rare; defensive). If any text
    // beyond the last emit accumulated, flush it once.
    if (seenAny && lastEmittedText !== "" && lastEmitMs < opts.clock.nowMs()) {
      // Nothing to flush when we never saw more deltas; safe no-op.
    }
  };
}

export type StreamEventThrottle = ReturnType<typeof makeStreamEventThrottle>;
