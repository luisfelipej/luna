import type { TelegramTransport } from "../../adapters/ports/telegram-transport.port.ts";
import type { WebhookEvent } from "../../entities/webhook-event.ts";

/**
 * Pure formatter — produces the single-line notification text for a parsed
 * webhook event. Kept separate from the side-effecting route so it stays
 * trivially testable.
 */
export function formatWebhookEvent(ev: WebhookEvent): string {
  switch (ev.kind) {
    case "push":
      return `[${ev.repo}] push by ${ev.actor} (${ev.commits} commit${ev.commits === 1 ? "" : "s"}) ${ev.compareUrl}`;
    case "pull_request":
      return `[${ev.repo}] PR #${ev.number} ${ev.action}: ${ev.title} — by ${ev.actor} ${ev.htmlUrl}`;
    case "issues":
      return `[${ev.repo}] Issue #${ev.number} ${ev.action}: ${ev.title} — by ${ev.actor} ${ev.htmlUrl}`;
    case "issue_comment": {
      const preview = ev.body.length > 120 ? `${ev.body.slice(0, 117)}...` : ev.body;
      return `[${ev.repo}] comment on #${ev.number} by ${ev.actor}: ${preview} ${ev.commentUrl}`;
    }
    case "pull_request_review":
      return `[${ev.repo}] review ${ev.state} on PR #${ev.number} by ${ev.actor} ${ev.htmlUrl}`;
    case "generic":
      return ev.text;
  }
}

export interface RouteWebhookEventDeps {
  readonly transport: TelegramTransport;
  readonly adminChatId: number;
}

export type RouteWebhookEvent = (ev: WebhookEvent) => Promise<void>;

/**
 * Side-effecting pipeline: format the parsed event and deliver it to the
 * admin Telegram chat. The generic-webhook path may override `chatId` via
 * the event payload — when `ev.kind === "generic"` its embedded `chatId`
 * wins over the default.
 */
export function makeRouteWebhookEvent(deps: RouteWebhookEventDeps): RouteWebhookEvent {
  return async (ev) => {
    const text = formatWebhookEvent(ev);
    const chatId = ev.kind === "generic" ? ev.chatId : deps.adminChatId;
    await deps.transport.sendMessage(chatId, text);
  };
}
