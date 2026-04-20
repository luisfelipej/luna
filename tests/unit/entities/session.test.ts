import { describe, expect, it } from "bun:test";
import type { Session } from "../../../src/entities/session.ts";

describe("Session entity", () => {
  it("constructs a session with and without sessionId", () => {
    const live: Session = {
      chatId: 42,
      sessionId: "abc-123",
      model: "sonnet",
      totalCostUsd: 0.5,
      lastUsedAt: new Date(0),
    };
    expect(live.sessionId).toBe("abc-123");

    const fresh: Session = {
      chatId: 42,
      sessionId: null,
      model: "sonnet",
      totalCostUsd: 0,
      lastUsedAt: new Date(0),
    };
    expect(fresh.sessionId).toBeNull();
  });
});
