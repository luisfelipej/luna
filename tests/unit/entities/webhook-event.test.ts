import { describe, expect, it } from "bun:test";
import type {
  WebhookEvent,
  WebhookEventKind,
} from "../../../src/entities/webhook-event.ts";

describe("WebhookEvent ADT", () => {
  it("exhaustive switch covers every kind", () => {
    const events: WebhookEvent[] = [
      {
        kind: "push",
        repo: "r",
        actor: "a",
        compareUrl: "https://x",
        commits: 2,
      },
      {
        kind: "pull_request",
        repo: "r",
        actor: "a",
        number: 1,
        action: "opened",
        title: "t",
        htmlUrl: "https://x",
      },
      {
        kind: "issues",
        repo: "r",
        actor: "a",
        number: 1,
        action: "opened",
        title: "t",
        htmlUrl: "https://x",
      },
      {
        kind: "issue_comment",
        repo: "r",
        actor: "a",
        number: 1,
        commentUrl: "https://x",
        body: "hi",
      },
      {
        kind: "pull_request_review",
        repo: "r",
        actor: "a",
        number: 1,
        state: "approved",
        htmlUrl: "https://x",
      },
      { kind: "generic", text: "hi", mode: "agent", chatId: 42 },
    ];

    const seen = new Set<WebhookEventKind>();
    for (const e of events) {
      const tag: string = ((): string => {
        switch (e.kind) {
          case "push":
            return "push";
          case "pull_request":
            return "pr";
          case "issues":
            return "issue";
          case "issue_comment":
            return "comment";
          case "pull_request_review":
            return "review";
          case "generic":
            return "generic";
        }
      })();
      seen.add(e.kind);
      expect(tag.length).toBeGreaterThan(0);
    }
    expect(seen.size).toBe(6);
  });
});
