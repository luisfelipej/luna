import { createHmac, timingSafeEqual } from "node:crypto";

export interface VerifyGithubSignatureInput {
  readonly body: Buffer;
  readonly secret: string;
  readonly header: string | null | undefined;
}

/**
 * Constant-time verification of an `X-Hub-Signature-256` header value
 * (`sha256=<hex>`) against HMAC-SHA256(body, secret).
 *
 * Never throws: any length mismatch / malformed input returns `false`.
 */
export function verifyGithubSignature(input: VerifyGithubSignatureInput): boolean {
  const { body, secret, header } = input;
  if (!header || !header.startsWith("sha256=")) return false;
  const hex = header.slice("sha256=".length);
  if (hex.length === 0) return false;
  let provided: Buffer;
  try {
    provided = Buffer.from(hex, "hex");
  } catch {
    return false;
  }
  // Buffer.from silently truncates odd-length hex; guard against that by
  // recomputing expected hex for length comparison.
  const expectedHex = createHmac("sha256", secret).update(body).digest("hex");
  if (provided.length * 2 !== expectedHex.length) return false;
  const expected = Buffer.from(expectedHex, "hex");
  if (provided.length !== expected.length) return false;
  return timingSafeEqual(provided, expected);
}

/**
 * Constant-time equality for two UTF-8 strings. Used by the bearer-token
 * middleware and the generic-webhook shared-secret check.
 */
export function constantTimeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}
