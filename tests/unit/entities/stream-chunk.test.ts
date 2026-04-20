import { describe, expect, it } from "bun:test";
import type { StreamChunk } from "../../../src/entities/stream-chunk.ts";

describe("StreamChunk", () => {
  it("constructs a mid-stream chunk", () => {
    const c: StreamChunk = { textSoFar: "hel", done: false };
    expect(c.done).toBe(false);
    expect(c.response).toBeUndefined();
  });

  it("constructs a terminal chunk with response metadata", () => {
    const c: StreamChunk = {
      textSoFar: "hello",
      done: true,
      response: { sessionId: "abc", costUsd: 0.01, durationMs: 1200 },
    };
    expect(c.response?.sessionId).toBe("abc");
  });
});
