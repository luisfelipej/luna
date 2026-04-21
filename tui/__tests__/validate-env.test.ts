import { describe, expect, it } from "bun:test";
import { validateEnv } from "../validate-env.ts";

describe("validateEnv", () => {
  it("throws when LUNA_API_URL is missing", () => {
    expect(() =>
      validateEnv({
        LUNA_API_URL: undefined,
        LUNA_API_SECRET: "secret",
      }),
    ).toThrow(/LUNA_API_URL/);
  });

  it("throws when LUNA_API_SECRET is missing", () => {
    expect(() =>
      validateEnv({
        LUNA_API_URL: "http://localhost:8080",
        LUNA_API_SECRET: undefined,
      }),
    ).toThrow(/LUNA_API_SECRET/);
  });

  it("returns valid config when all required vars are present", () => {
    const config = validateEnv({
      LUNA_API_URL: "http://localhost:8080",
      LUNA_API_SECRET: "my-secret",
    });
    expect(config.apiUrl).toBe("http://localhost:8080");
    expect(config.apiSecret).toBe("my-secret");
    expect(config.pollMs).toBe(2000); // default
  });

  it("uses TUI_POLL_MS when provided", () => {
    const config = validateEnv({
      LUNA_API_URL: "http://localhost:8080",
      LUNA_API_SECRET: "my-secret",
      TUI_POLL_MS: "5000",
    });
    expect(config.pollMs).toBe(5000);
  });

  it("falls back to default pollMs when TUI_POLL_MS is invalid", () => {
    const config = validateEnv({
      LUNA_API_URL: "http://localhost:8080",
      LUNA_API_SECRET: "my-secret",
      TUI_POLL_MS: "not-a-number",
    });
    expect(config.pollMs).toBe(2000);
  });
});
