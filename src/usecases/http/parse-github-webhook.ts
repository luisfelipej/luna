import type { WebhookEvent } from "../../entities/webhook-event.ts";

/**
 * Parse a raw GitHub webhook payload (already JSON-decoded) into a typed
 * `WebhookEvent`. Returns `null` for unknown event types or for known event
 * types whose payload doesn't contain the fields we need (the HTTP route
 * treats null-on-unknown as 204 no-op).
 *
 * Pure function — no I/O, no side effects.
 */
export function parseGithubWebhook(eventType: string, payload: unknown): WebhookEvent | null {
  if (typeof payload !== "object" || payload === null) return null;
  const p = payload as Record<string, unknown>;
  const repoFullName = pick(p, "repository", "full_name");
  const actor = pick(p, "sender", "login");
  if (typeof repoFullName !== "string" || typeof actor !== "string") return null;

  switch (eventType) {
    case "push": {
      const compareUrl = typeof p.compare === "string" ? p.compare : null;
      const commitsArr = Array.isArray(p.commits) ? p.commits : null;
      if (compareUrl === null || commitsArr === null) return null;
      return {
        kind: "push",
        repo: repoFullName,
        actor,
        compareUrl,
        commits: commitsArr.length,
      };
    }
    case "pull_request": {
      const action = typeof p.action === "string" ? p.action : null;
      const pr = p.pull_request as Record<string, unknown> | undefined;
      const number = typeof pr?.number === "number" ? pr.number : null;
      const title = typeof pr?.title === "string" ? pr.title : null;
      const htmlUrl = typeof pr?.html_url === "string" ? pr.html_url : null;
      if (action === null || number === null || title === null || htmlUrl === null) {
        return null;
      }
      return {
        kind: "pull_request",
        repo: repoFullName,
        actor,
        number,
        action,
        title,
        htmlUrl,
      };
    }
    case "issues": {
      const action = typeof p.action === "string" ? p.action : null;
      const issue = p.issue as Record<string, unknown> | undefined;
      const number = typeof issue?.number === "number" ? issue.number : null;
      const title = typeof issue?.title === "string" ? issue.title : null;
      const htmlUrl = typeof issue?.html_url === "string" ? issue.html_url : null;
      if (action === null || number === null || title === null || htmlUrl === null) {
        return null;
      }
      return {
        kind: "issues",
        repo: repoFullName,
        actor,
        number,
        action,
        title,
        htmlUrl,
      };
    }
    case "issue_comment": {
      const issue = p.issue as Record<string, unknown> | undefined;
      const comment = p.comment as Record<string, unknown> | undefined;
      const number = typeof issue?.number === "number" ? issue.number : null;
      const url = typeof comment?.html_url === "string" ? comment.html_url : null;
      const body = typeof comment?.body === "string" ? comment.body : "";
      if (number === null || url === null) return null;
      return {
        kind: "issue_comment",
        repo: repoFullName,
        actor,
        number,
        commentUrl: url,
        body,
      };
    }
    case "pull_request_review": {
      const pr = p.pull_request as Record<string, unknown> | undefined;
      const review = p.review as Record<string, unknown> | undefined;
      const number = typeof pr?.number === "number" ? pr.number : null;
      const state = typeof review?.state === "string" ? review.state : null;
      const htmlUrl = typeof review?.html_url === "string" ? review.html_url : null;
      if (number === null || state === null || htmlUrl === null) return null;
      return {
        kind: "pull_request_review",
        repo: repoFullName,
        actor,
        number,
        state,
        htmlUrl,
      };
    }
    default:
      return null;
  }
}

function pick(p: Record<string, unknown>, outer: string, inner: string): unknown {
  const o = p[outer];
  if (typeof o !== "object" || o === null) return undefined;
  return (o as Record<string, unknown>)[inner];
}
