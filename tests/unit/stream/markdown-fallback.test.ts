import { describe, expect, it } from "bun:test";
import {
  defaultIsParseError,
  sendWithMarkdownFallback,
} from "../../../src/usecases/stream/markdown-fallback.ts";

describe("sendWithMarkdownFallback", () => {
  it("returns the markdown path when no error", async () => {
    const calls: Array<{ markdown: boolean }> = [];
    const out = await sendWithMarkdownFallback(async (opts) => {
      calls.push(opts);
      return 42;
    });
    expect(out).toBe(42);
    expect(calls).toEqual([{ markdown: true }]);
  });

  it("retries plain text when markdown raises a parse error", async () => {
    const calls: Array<{ markdown: boolean }> = [];
    const out = await sendWithMarkdownFallback(async (opts) => {
      calls.push(opts);
      if (opts.markdown) throw new Error("Bad Request: can't parse entities: Character '_'");
      return "ok-plain";
    });
    expect(out).toBe("ok-plain");
    expect(calls).toEqual([{ markdown: true }, { markdown: false }]);
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
