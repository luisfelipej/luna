import { describe, expect, it } from "bun:test";
import {
  defaultIsParseError,
  sendWithMarkdownFallback,
} from "../../../src/usecases/stream/markdown-fallback.ts";

describe("sendWithMarkdownFallback", () => {
  it("sends with html: true and converted body on success", async () => {
    const calls: Array<{ html: boolean; body: string }> = [];
    const out = await sendWithMarkdownFallback("hello world", async (opts) => {
      calls.push(opts);
      return 42;
    });
    expect(out).toBe(42);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.html).toBe(true);
    // plain text → same body (no HTML tags added for plain text)
    expect(calls[0]?.body).toBe("hello world");
  });

  it("retries with html: false and rawText on parse error", async () => {
    const calls: Array<{ html: boolean; body: string }> = [];
    const result = await sendWithMarkdownFallback("**bold**", async (opts) => {
      calls.push(opts);
      if (opts.html) throw new Error("Bad Request: can't parse entities");
      return "plain";
    });
    expect(result).toBe("plain");
    expect(calls).toHaveLength(2);
    expect(calls[0]?.html).toBe(true);
    expect(calls[1]?.html).toBe(false);
    expect(calls[1]?.body).toBe("**bold**");
  });

  it("rethrows non-parse errors without retry", async () => {
    let calls = 0;
    await expect(
      sendWithMarkdownFallback("text", async () => {
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
