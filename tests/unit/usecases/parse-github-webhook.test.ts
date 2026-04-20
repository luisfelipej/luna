import { describe, expect, it } from "bun:test";
import { parseGithubWebhook } from "../../../src/usecases/http/parse-github-webhook.ts";

describe("parseGithubWebhook", () => {
  it("parses a push event", () => {
    const ev = parseGithubWebhook("push", {
      repository: { full_name: "octocat/hello" },
      sender: { login: "octocat" },
      compare: "https://github.com/octocat/hello/compare/abc...def",
      commits: [{}, {}],
    });
    expect(ev).toEqual({
      kind: "push",
      repo: "octocat/hello",
      actor: "octocat",
      compareUrl: "https://github.com/octocat/hello/compare/abc...def",
      commits: 2,
    });
  });

  it("parses a pull_request opened event", () => {
    const ev = parseGithubWebhook("pull_request", {
      action: "opened",
      repository: { full_name: "octocat/hello" },
      sender: { login: "alice" },
      pull_request: { number: 7, title: "Fix bug", html_url: "https://x/pr/7" },
    });
    expect(ev).toEqual({
      kind: "pull_request",
      repo: "octocat/hello",
      actor: "alice",
      number: 7,
      action: "opened",
      title: "Fix bug",
      htmlUrl: "https://x/pr/7",
    });
  });

  it("parses an issues event", () => {
    const ev = parseGithubWebhook("issues", {
      action: "opened",
      repository: { full_name: "r/x" },
      sender: { login: "bob" },
      issue: { number: 3, title: "Broken", html_url: "https://x/i/3" },
    });
    expect(ev?.kind).toBe("issues");
    if (ev?.kind !== "issues") return;
    expect(ev.number).toBe(3);
    expect(ev.title).toBe("Broken");
  });

  it("parses an issue_comment", () => {
    const ev = parseGithubWebhook("issue_comment", {
      repository: { full_name: "r/x" },
      sender: { login: "carol" },
      issue: { number: 9 },
      comment: { html_url: "https://x/c/1", body: "looks good" },
    });
    expect(ev?.kind).toBe("issue_comment");
  });

  it("parses a pull_request_review", () => {
    const ev = parseGithubWebhook("pull_request_review", {
      repository: { full_name: "r/x" },
      sender: { login: "dan" },
      pull_request: { number: 11 },
      review: { state: "approved", html_url: "https://x/r/1" },
    });
    expect(ev?.kind).toBe("pull_request_review");
  });

  it("returns null for unknown event types (star, release, etc.)", () => {
    expect(parseGithubWebhook("star", { anything: 1 })).toBeNull();
    expect(parseGithubWebhook("release", {})).toBeNull();
  });

  it("returns null for a malformed payload shape", () => {
    expect(parseGithubWebhook("push", { nothing: true })).toBeNull();
  });
});
