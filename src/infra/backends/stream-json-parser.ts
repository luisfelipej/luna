import type { StreamChunk } from "../../entities/stream-chunk.ts";

/**
 * Claude Code CLI newline-delimited stream-json frame.
 *
 * The CLI emits one JSON object per line. M1 consumes the subset below:
 *
 *   {"type":"assistant","message":{"content":[{"type":"text","text":"..."}]}}
 *   {"type":"assistant","message":{"content":[{"type":"tool_use",...}]}}
 *   {"type":"tool_result", ...}
 *   {"type":"result","session_id":"sid","total_cost_usd":0.01,"duration_ms":42, ...}
 *   {"type":"error","error":"..."}
 *
 * Unknown frames are tolerated (reported as `kind:"unknown"`) so a new CLI
 * revision does not break streaming.
 */
export type ParsedFrame =
  | { kind: "text"; text: string }
  | { kind: "tool_use"; name?: string; input?: unknown }
  | { kind: "tool_result"; content?: unknown }
  | { kind: "result"; sessionId: string; costUsd: number; durationMs: number }
  | { kind: "error"; message: string }
  | { kind: "unknown"; raw: unknown }
  | { kind: "malformed"; raw: string; error: string };

/**
 * Running state for a line-buffered parser. Feed UTF-8 byte chunks or strings
 * via `feed` and pull `ParsedFrame[]` out. The final `flush()` emits any
 * trailing non-newline-terminated line (rare; Claude always terminates).
 */
export interface StreamJsonParser {
  feed(chunk: string | Uint8Array): ParsedFrame[];
  flush(): ParsedFrame[];
}

/**
 * Build a fresh parser. The parser:
 * - Concatenates incoming UTF-8 bytes, decoding with `TextDecoder({fatal:false, stream:true})`
 *   so multi-byte codepoints split across chunk boundaries are reassembled.
 * - Splits on `\n` and emits one `ParsedFrame` per complete line.
 * - Tolerates blank lines and lines that fail `JSON.parse` (emits `malformed`).
 */
export function createStreamJsonParser(): StreamJsonParser {
  const decoder = new TextDecoder("utf-8", { fatal: false });
  let buffer = "";

  function parseLine(raw: string): ParsedFrame | null {
    const trimmed = raw.trim();
    if (trimmed === "") return null;
    let obj: unknown;
    try {
      obj = JSON.parse(trimmed);
    } catch (err) {
      return { kind: "malformed", raw: trimmed, error: (err as Error).message };
    }
    return interpret(obj);
  }

  return {
    feed(chunk: string | Uint8Array): ParsedFrame[] {
      buffer += typeof chunk === "string" ? chunk : decoder.decode(chunk, { stream: true });
      const out: ParsedFrame[] = [];
      let idx: number;
      while ((idx = buffer.indexOf("\n")) !== -1) {
        const line = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 1);
        const frame = parseLine(line);
        if (frame) out.push(frame);
      }
      return out;
    },
    flush(): ParsedFrame[] {
      const tail = buffer + decoder.decode();
      buffer = "";
      if (tail === "") return [];
      const frame = parseLine(tail);
      return frame ? [frame] : [];
    },
  };
}

function interpret(obj: unknown): ParsedFrame {
  if (!isRecord(obj) || typeof obj.type !== "string") {
    return { kind: "unknown", raw: obj };
  }
  switch (obj.type) {
    case "assistant": {
      const msg = obj.message;
      if (isRecord(msg) && Array.isArray(msg.content)) {
        // Collect any text blocks; prefer first tool_use if present.
        for (const block of msg.content) {
          if (!isRecord(block)) continue;
          if (block.type === "text" && typeof block.text === "string") {
            return { kind: "text", text: block.text };
          }
          if (block.type === "tool_use") {
            const name = typeof block.name === "string" ? block.name : undefined;
            return {
              kind: "tool_use",
              ...(name !== undefined ? { name } : {}),
              input: block.input,
            };
          }
        }
      }
      return { kind: "unknown", raw: obj };
    }
    case "tool_result":
      return { kind: "tool_result", content: obj.content };
    case "result": {
      const sessionId = typeof obj.session_id === "string" ? obj.session_id : "";
      const costUsd = typeof obj.total_cost_usd === "number" ? obj.total_cost_usd : 0;
      const durationMs = typeof obj.duration_ms === "number" ? obj.duration_ms : 0;
      return { kind: "result", sessionId, costUsd, durationMs };
    }
    case "error": {
      const message = typeof obj.error === "string" ? obj.error : JSON.stringify(obj);
      return { kind: "error", message };
    }
    default:
      return { kind: "unknown", raw: obj };
  }
}

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === "object" && x !== null && !Array.isArray(x);
}

/**
 * High-level adapter: given a stream of ParsedFrames, produce StreamChunks
 * in the `{textSoFar, done, response?}` shape the rest of Luna consumes.
 *
 * - `text` frames append to the rolling assistant text and yield an interim
 *   chunk (`done: false`).
 * - `tool_use` / `tool_result` frames do not change the visible text (the
 *   Claude CLI emits the textual narration in separate `text` frames), but
 *   we still yield a chunk with the current `textSoFar` to keep the pump alive.
 * - `result` ends the stream with `done: true` and carries `response`.
 * - `error` throws — callers wrap in BackendError.
 * - `malformed` / `unknown` are skipped (callers may log via a side channel).
 */
export function* framesToChunks(
  frames: Iterable<ParsedFrame>,
  initialText = "",
): Generator<StreamChunk, void, void> {
  let text = initialText;
  for (const frame of frames) {
    switch (frame.kind) {
      case "text":
        text += frame.text;
        yield { textSoFar: text, done: false };
        break;
      case "tool_use":
      case "tool_result":
        // Surface a "still alive" chunk without altering text.
        yield { textSoFar: text, done: false };
        break;
      case "result":
        yield {
          textSoFar: text,
          done: true,
          response: {
            sessionId: frame.sessionId,
            costUsd: frame.costUsd,
            durationMs: frame.durationMs,
          },
        };
        return;
      case "error":
        throw new Error(`claude backend error: ${frame.message}`);
      case "malformed":
      case "unknown":
        // Skip silently; callers may log.
        break;
    }
  }
}
