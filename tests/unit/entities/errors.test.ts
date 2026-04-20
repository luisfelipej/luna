import { describe, expect, it } from "bun:test";
import {
  AuthError,
  BackendError,
  ConfigError,
  LunaError,
  PathConfinementError,
  RateLimitError,
  SSRFError,
  StaleSessionError,
  WebhookSignatureError,
} from "../../../src/entities/errors.ts";

describe("LunaError hierarchy", () => {
  it("AuthError has code=AUTH and preserves cause", () => {
    const cause = new Error("boom");
    const err = new AuthError("not allowed", cause);
    expect(err).toBeInstanceOf(LunaError);
    expect(err).toBeInstanceOf(Error);
    expect(err.code).toBe("AUTH");
    expect(err.message).toBe("not allowed");
    expect(err.cause).toBe(cause);
    expect(err.name).toBe("AuthError");
  });

  it("ConfigError has code=CONFIG", () => {
    expect(new ConfigError("bad env").code).toBe("CONFIG");
  });

  it("BackendError has code=BACKEND", () => {
    expect(new BackendError("subprocess failed").code).toBe("BACKEND");
  });

  it("PathConfinementError has code=PATH_ESCAPE", () => {
    expect(new PathConfinementError("outside base").code).toBe("PATH_ESCAPE");
  });

  it("WebhookSignatureError has code=WEBHOOK_SIG", () => {
    expect(new WebhookSignatureError("bad hmac").code).toBe("WEBHOOK_SIG");
  });

  it("SSRFError has code=SSRF", () => {
    expect(new SSRFError("blocked ip").code).toBe("SSRF");
  });

  it("RateLimitError has code=RATE_LIMIT", () => {
    expect(new RateLimitError("over budget").code).toBe("RATE_LIMIT");
  });

  it("StaleSessionError has code=STALE_SESSION", () => {
    expect(new StaleSessionError("session expired").code).toBe("STALE_SESSION");
  });

  it("errors without a cause keep cause undefined", () => {
    const err = new ConfigError("nope");
    expect(err.cause).toBeUndefined();
  });

  it("all subclasses are instanceof LunaError", () => {
    const subclasses: LunaError[] = [
      new AuthError("a"),
      new ConfigError("a"),
      new BackendError("a"),
      new PathConfinementError("a"),
      new WebhookSignatureError("a"),
      new SSRFError("a"),
      new RateLimitError("a"),
      new StaleSessionError("a"),
    ];
    for (const err of subclasses) {
      expect(err).toBeInstanceOf(LunaError);
    }
  });
});
