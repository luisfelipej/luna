import { describe, expect, it } from "bun:test";
import {
  createStreamJsonParser,
  framesToChunks,
} from "../../../src/infra/backends/stream-json-parser.ts";

describe("createStreamJsonParser", () => {
  it("parses three assistant deltas + one terminal result", () => {
    const p = createStreamJsonParser();
    const lines =
      JSON.stringify({
        type: "assistant",
        message: { content: [{ type: "text", text: "hel" }] },
      }) +
      "\n" +
      JSON.stringify({
        type: "assistant",
        message: { content: [{ type: "text", text: "lo " }] },
      }) +
      "\n" +
      JSON.stringify({
        type: "assistant",
        message: { content: [{ type: "text", text: "world" }] },
      }) +
      "\n" +
      JSON.stringify({
        type: "result",
        session_id: "sid-1",
        total_cost_usd: 0.0123,
        duration_ms: 420,
      }) +
      "\n";

    const frames = p.feed(lines);
    expect(frames.length).toBe(4);
    expect(frames[0]).toEqual({ kind: "text", text: "hel" });
    expect(frames[3]).toEqual({
      kind: "result",
      sessionId: "sid-1",
      costUsd: 0.0123,
      durationMs: 420,
    });
  });

  it("buffers partial lines across feeds", () => {
    const p = createStreamJsonParser();
    const full = JSON.stringify({
      type: "assistant",
      message: { content: [{ type: "text", text: "x" }] },
    });
    const half1 = full.slice(0, 10);
    const half2 = full.slice(10) + "\n";
    expect(p.feed(half1)).toEqual([]);
    const out = p.feed(half2);
    expect(out.length).toBe(1);
    expect(out[0]).toEqual({ kind: "text", text: "x" });
  });

  it("surfaces malformed frames with `kind: malformed`", () => {
    const p = createStreamJsonParser();
    const frames = p.feed('{"bad json\n');
    expect(frames.length).toBe(1);
    expect(frames[0]?.kind).toBe("malformed");
  });

  it("handles UTF-8 multi-byte codepoints split across byte chunks", () => {
    const p = createStreamJsonParser();
    const payload =
      JSON.stringify({
        type: "assistant",
        message: { content: [{ type: "text", text: "héllo" }] },
      }) + "\n";
    const bytes = new TextEncoder().encode(payload);
    // Find index mid-é (é is 2 bytes). Locate the 'é' byte index.
    const firstByteOfE = payload.indexOf("é");
    // We can't slice by char directly — compute the byte offset via encoding prefix.
    const byteOffset = new TextEncoder().encode(payload.slice(0, firstByteOfE + 1)).length - 1;

    const a = bytes.slice(0, byteOffset);
    const b = bytes.slice(byteOffset);
    expect(p.feed(a)).toEqual([]);
    const out = p.feed(b);
    expect(out.length).toBe(1);
    expect(out[0]).toEqual({ kind: "text", text: "héllo" });
  });

  it("ignores blank lines", () => {
    const p = createStreamJsonParser();
    expect(p.feed("\n\n")).toEqual([]);
  });

  it("flush emits a trailing non-newline-terminated line", () => {
    const p = createStreamJsonParser();
    const frame = JSON.stringify({
      type: "assistant",
      message: { content: [{ type: "text", text: "tail" }] },
    });
    expect(p.feed(frame)).toEqual([]);
    const out = p.flush();
    expect(out).toEqual([{ kind: "text", text: "tail" }]);
  });

  it("parses tool_use + tool_result + error frames", () => {
    const p = createStreamJsonParser();
    const lines = [
      JSON.stringify({
        type: "assistant",
        message: { content: [{ type: "tool_use", name: "Read", input: { path: "/a" } }] },
      }),
      JSON.stringify({ type: "tool_result", content: "ok" }),
      JSON.stringify({ type: "error", error: "boom" }),
      "",
    ].join("\n");
    const frames = p.feed(lines);
    expect(frames.map((f) => f.kind)).toEqual(["tool_use", "tool_result", "error"]);
  });
});

describe("framesToChunks", () => {
  it("accumulates assistant text and emits terminal chunk with response", () => {
    const frames = [
      { kind: "text" as const, text: "hel" },
      { kind: "text" as const, text: "lo" },
      { kind: "result" as const, sessionId: "s", costUsd: 0.01, durationMs: 1 },
    ];
    const chunks = [...framesToChunks(frames)];
    expect(chunks.length).toBe(3);
    expect(chunks[0]).toEqual({ textSoFar: "hel", done: false });
    expect(chunks[1]).toEqual({ textSoFar: "hello", done: false });
    expect(chunks[2]).toEqual({
      textSoFar: "hello",
      done: true,
      response: { sessionId: "s", costUsd: 0.01, durationMs: 1 },
    });
  });

  it("throws on error frame", () => {
    const run = () => [...framesToChunks([{ kind: "error" as const, message: "boom" }])];
    expect(run).toThrow(/boom/);
  });

  it("yields keepalive on tool_use without changing text", () => {
    const chunks = [
      ...framesToChunks([
        { kind: "text", text: "hi" },
        { kind: "tool_use", name: "X" },
        { kind: "result", sessionId: "s", costUsd: 0, durationMs: 0 },
      ]),
    ];
    expect(chunks[0]?.textSoFar).toBe("hi");
    expect(chunks[1]?.textSoFar).toBe("hi");
    expect(chunks[2]?.done).toBe(true);
  });
});
