import { describe, expect, it } from "bun:test";
import {
  defaultIsParseError,
  sendWithMarkdownFallback,
} from "../../../src/usecases/stream/markdown-fallback.ts";

describe("sendWithMarkdownFallback", () => {
  it("sends with plain text (markdown disabled by default in M1)", async () => {
    const calls: Array<{ markdown: boolean }> = [];
    const out = await sendWithMarkdownFallback(async (opts) => {
      calls.push(opts);
      return 42;
    });
    expect(out).toBe(42);
    expect(calls).toEqual([{ markdown: false }]);
  });

  it("rethrows non-parse errors without retry", async () => {
    let calls = 0;
    await expect(
      sendWithMarkdownFallback(async () => {
        calls++;
        throw new Error("network down");
      }),
    ).rejects.toThrow("network down");
    expect(calls).toBe(1);
  });
});

describe("defaultIsParseError", () => {
  it("matches Telegram phrasings", () => {
    expect(defaultIsParseError(new Error("Bad Request: can't parse entities"))).toBe(true);
    expect(defaultIsParseError(new Error("MARKDOWN parse failed"))).toBe(true);
  });
  it("rejects unrelated errors", () => {
    expect(defaultIsParseError(new Error("ECONNRESET"))).toBe(false);
    expect(defaultIsParseError("random string")).toBe(false);
  });
});
