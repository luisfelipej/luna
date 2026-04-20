import { createHmac } from "node:crypto";
import { describe, expect, it } from "bun:test";
import { verifyGithubSignature } from "../../../src/usecases/http/hmac-verifier.ts";

describe("verifyGithubSignature", () => {
  const secret = "s3cr3t";
  const body = Buffer.from('{"hello":"world"}');
  const expected = "sha256=" + createHmac("sha256", secret).update(body).digest("hex");

  it("accepts a matching signature", () => {
    expect(verifyGithubSignature({ body, secret, header: expected })).toBe(true);
  });

  it("rejects a mismatched signature", () => {
    const bad = "sha256=" + "0".repeat(64);
    expect(verifyGithubSignature({ body, secret, header: bad })).toBe(false);
  });

  it("rejects a header missing the sha256= prefix", () => {
    const hex = createHmac("sha256", secret).update(body).digest("hex");
    expect(verifyGithubSignature({ body, secret, header: hex })).toBe(false);
  });

  it("rejects an empty or null header", () => {
    expect(verifyGithubSignature({ body, secret, header: null })).toBe(false);
    expect(verifyGithubSignature({ body, secret, header: "" })).toBe(false);
  });

  it("rejects a signature of the wrong length without throwing", () => {
    expect(verifyGithubSignature({ body, secret, header: "sha256=deadbeef" })).toBe(false);
  });
});
