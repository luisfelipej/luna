import { describe, expect, it } from "bun:test";
import {
  formatWebhookEvent,
  makeRouteWebhookEvent,
} from "../../../src/usecases/http/route-webhook-event.ts";
import { FakeTelegramTransport } from "../../helpers/fakes/fake-telegram-transport.ts";

describe("formatWebhookEvent", () => {
  it("formats a push summary", () => {
    const msg = formatWebhookEvent({
      kind: "push",
      repo: "octocat/hello",
      actor: "octocat",
      compareUrl: "https://x/cmp",
      commits: 2,
    });
    expect(msg).toContain("octocat/hello");
    expect(msg).toContain("push");
    expect(msg).toContain("octocat");
    expect(msg).toContain("https://x/cmp");
  });

  it("formats a PR opened summary", () => {
    const msg = formatWebhookEvent({
      kind: "pull_request",
      repo: "r/x",
      actor: "a",
      number: 7,
      action: "opened",
      title: "Fix bug",
      htmlUrl: "https://x/pr/7",
    });
    expect(msg).toContain("PR #7 opened: Fix bug");
    expect(msg).toContain("https://x/pr/7");
  });

  it("formats an issues summary", () => {
    const msg = formatWebhookEvent({
      kind: "issues",
      repo: "r/x",
      actor: "b",
      number: 3,
      action: "closed",
      title: "Broken",
      htmlUrl: "https://x/i/3",
    });
    expect(msg).toContain("Issue #3 closed: Broken");
  });

  it("formats a comment summary", () => {
    const msg = formatWebhookEvent({
      kind: "issue_comment",
      repo: "r/x",
      actor: "c",
      number: 9,
      commentUrl: "https://x/c/1",
      body: "looks good to me",
    });
    expect(msg).toContain("comment on #9");
    expect(msg).toContain("https://x/c/1");
  });

  it("formats a review summary", () => {
    const msg = formatWebhookEvent({
      kind: "pull_request_review",
      repo: "r/x",
      actor: "d",
      number: 11,
      state: "approved",
      htmlUrl: "https://x/r/1",
    });
    expect(msg).toContain("review approved on PR #11");
  });

  it("formats a generic event summary", () => {
    const msg = formatWebhookEvent({
      kind: "generic",
      text: "deploy done",
      mode: "reminder",
      chatId: 42,
    });
    expect(msg).toContain("deploy done");
  });
});

describe("makeRouteWebhookEvent", () => {
  it("sends the formatted text to the admin chat via the transport", async () => {
    const transport = new FakeTelegramTransport();
    const route = makeRouteWebhookEvent({ transport, adminChatId: 100 });
    await route({
      kind: "push",
      repo: "o/h",
      actor: "a",
      compareUrl: "https://x",
      commits: 1,
    });
    expect(transport.sent).toHaveLength(1);
    expect(transport.sent[0]?.chatId).toBe(100);
    expect(transport.sent[0]?.text).toContain("o/h");
  });
});
