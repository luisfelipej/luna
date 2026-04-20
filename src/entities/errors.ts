/**
 * Luna error hierarchy. All use cases throw LunaError subtypes; the Telegram
 * presenter + HTTP routes map `error.code` to user-facing messages / HTTP
 * statuses. `cause` is always logged by pino, never sent to the user.
 *
 * Pure entities layer — zero framework imports.
 */
export abstract class LunaError extends Error {
  abstract readonly code: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  override readonly cause?: unknown;

  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = this.constructor.name;
    if (cause !== undefined) {
      this.cause = cause;
    }
  }
}

export class AuthError extends LunaError {
  readonly code = "AUTH";
}

export class ConfigError extends LunaError {
  readonly code = "CONFIG";
}

export class BackendError extends LunaError {
  readonly code = "BACKEND";
}

export class PathConfinementError extends LunaError {
  readonly code = "PATH_ESCAPE";
}

export class WebhookSignatureError extends LunaError {
  readonly code = "WEBHOOK_SIG";
}

export class SSRFError extends LunaError {
  readonly code = "SSRF";
}

export class RateLimitError extends LunaError {
  readonly code = "RATE_LIMIT";
}

export class StaleSessionError extends LunaError {
  readonly code = "STALE_SESSION";
}
