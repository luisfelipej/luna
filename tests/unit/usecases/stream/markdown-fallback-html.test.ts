import { describe, expect, it } from "bun:test";
import { sendWithMarkdownFallback } from "../../../../src/usecases/stream/markdown-fallback.ts";

/**
 * Phase 4.2: Integration tests for sendWithMarkdownFallback with rawText threading.
 *
 * Verifies that:
 * 1. The converter is called and htmlBody is passed as body to fn
 * 2. html: true is used on first attempt
 * 3. On Telegram parse error, retries with html: false and body = rawText
 */
describe("sendWithMarkdownFallback — html wiring (Phase 1.3 / 3.2)", () => {
  it("calls fn with html: true and converted body on first attempt", async () => {
    const calls: Array<{ html: boolean; body: string }> = [];
    const rawText = "**bold**";

    await sendWithMarkdownFallback(rawText, async (opts) => {
      calls.push(opts);
      return "ok";
    });

    expect(calls).toHaveLength(1);
    expect(calls[0]?.html).toBe(true);
    // The body should be the HTML-converted version, not raw markdown
    expect(calls[0]?.body).toContain("<b>bold</b>");
  });

  it("passes plain text as converted body when input is plain", async () => {
    const calls: Array<{ html: boolean; body: string }> = [];
    const rawText = "hello world";

    await sendWithMarkdownFallback(rawText, async (opts) => {
      calls.push(opts);
      return "ok";
    });

    expect(calls[0]?.body).toBe("hello world");
  });

  it("retries with html: false and rawText body on Telegram parse error", async () => {
    const calls: Array<{ html: boolean; body: string }> = [];
    const rawText = "**bold**";

    const result = await sendWithMarkdownFallback(rawText, async (opts) => {
      calls.push(opts);
      if (opts.html) {
        throw new Error("Bad Request: can't parse entities in the message");
      }
      return "fallback-result";
    });

    expect(result).toBe("fallback-result");
    expect(calls).toHaveLength(2);
    expect(calls[0]?.html).toBe(true);
    expect(calls[1]?.html).toBe(false);
    // Fallback uses rawText as body
    expect(calls[1]?.body).toBe(rawText);
  });

  it("rethrows non-parse errors without retry", async () => {
    let calls = 0;
    await expect(
      sendWithMarkdownFallback("some text", async () => {
        calls++;
        throw new Error("network down");
      }),
    ).rejects.toThrow("network down");
    expect(calls).toBe(1);
  });

  it("returns value from fn on success", async () => {
    const result = await sendWithMarkdownFallback("text", async () => 42);
    expect(result).toBe(42);
  });
});
