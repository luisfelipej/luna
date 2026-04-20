import type { Context, MiddlewareHandler } from "hono";
import { constantTimeEqual } from "../../usecases/http/hmac-verifier.ts";

/**
 * Bearer-token middleware for `/api/*`. Compares the
 * `Authorization: Bearer <token>` header (or an `X-Api-Key` fallback) to
 * the configured secret using constant-time equality. Responds 401 on
 * mismatch / missing.
 *
 * If the secret is unset, the middleware returns 503 `API disabled`. This
 * matches the `/webhook/github` "secret not configured" semantics from
 * spec #46.
 */
export function bearerAuth(secret: string | undefined): MiddlewareHandler {
  return async (c, next) => {
    if (!secret) return c.text("API disabled", 503);
    const token = extractToken(c);
    if (!token || !constantTimeEqual(token, secret)) {
      return c.text("Unauthorized", 401);
    }
    await next();
    return;
  };
}

function extractToken(c: Context): string | null {
  const auth = c.req.header("authorization");
  if (auth) {
    const m = /^Bearer\s+(.+)$/i.exec(auth.trim());
    if (m && m[1]) return m[1].trim();
  }
  const apiKey = c.req.header("x-api-key");
  if (apiKey) return apiKey.trim();
  return null;
}
