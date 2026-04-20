import { describe, expect, it } from "bun:test";
import type { MessageLine } from "../../../src/entities/message.ts";

describe("MessageLine", () => {
  it("constructs a plain user line", () => {
    const m: MessageLine = {
      chatId: 42,
      text: "hi",
      dir: "user",
      ts: "2026-04-20T00:00:00Z",
    };
    expect(m.media).toBeUndefined();
  });

  it("constructs an assistant line", () => {
    const m: MessageLine = {
      chatId: 42,
      text: "hello",
      dir: "assistant",
      ts: "2026-04-20T00:00:00Z",
    };
    expect(m.dir).toBe("assistant");
  });

  it("carries optional media", () => {
    const m: MessageLine = {
      chatId: 42,
      text: "",
      dir: "user",
      ts: "2026-04-20T00:00:00Z",
      media: { kind: "photo", ref: "tg://fileid/abc", caption: "look" },
    };
    expect(m.media?.kind).toBe("photo");
  });
});
