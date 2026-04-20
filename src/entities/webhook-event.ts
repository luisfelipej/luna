/**
 * Parsed webhook event. Produced by `HandleGithubWebhook` (for github events)
 * and `HandleGenericWebhook` (for the `generic` kind). Telegram presenter
 * renders each variant to a per-chat notification.
 */
export type WebhookEvent =
  | {
      readonly kind: "push";
      readonly repo: string;
      readonly actor: string;
      readonly compareUrl: string;
      readonly commits: number;
    }
  | {
      readonly kind: "pull_request";
      readonly repo: string;
      readonly actor: string;
      readonly number: number;
      readonly action: string;
      readonly title: string;
      readonly htmlUrl: string;
    }
  | {
      readonly kind: "issues";
      readonly repo: string;
      readonly actor: string;
      readonly number: number;
      readonly action: string;
      readonly title: string;
      readonly htmlUrl: string;
    }
  | {
      readonly kind: "issue_comment";
      readonly repo: string;
      readonly actor: string;
      readonly number: number;
      readonly commentUrl: string;
      readonly body: string;
    }
  | {
      readonly kind: "pull_request_review";
      readonly repo: string;
      readonly actor: string;
      readonly number: number;
      readonly state: string;
      readonly htmlUrl: string;
    }
  | {
      readonly kind: "generic";
      readonly text: string;
      readonly mode: "agent" | "reminder";
      readonly chatId: number;
    };

export type WebhookEventKind = WebhookEvent["kind"];
