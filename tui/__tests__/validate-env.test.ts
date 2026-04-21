import { describe, expect, it } from "bun:test";
import { validateEnv } from "../validate-env.ts";

const REQUIRED = {
  LUNA_API_URL: "http://localhost:8080",
  LUNA_API_SECRET: "my-secret",
  LUNA_CHAT_ID: "123456",
};

describe("validateEnv", () => {
  it("throws when LUNA_API_URL is missing", () => {
    expect(() => validateEnv({ ...REQUIRED, LUNA_API_URL: undefined })).toThrow(/LUNA_API_URL/);
  });

  it("throws when LUNA_API_SECRET is missing", () => {
    expect(() => validateEnv({ ...REQUIRED, LUNA_API_SECRET: undefined })).toThrow(
      /LUNA_API_SECRET/,
    );
  });

  it("throws when LUNA_CHAT_ID is missing", () => {
    expect(() => validateEnv({ ...REQUIRED, LUNA_CHAT_ID: undefined })).toThrow(/LUNA_CHAT_ID/);
  });

  it("throws when LUNA_CHAT_ID is not a positive integer", () => {
    expect(() => validateEnv({ ...REQUIRED, LUNA_CHAT_ID: "abc" })).toThrow(/LUNA_CHAT_ID/);
    expect(() => validateEnv({ ...REQUIRED, LUNA_CHAT_ID: "0" })).toThrow(/LUNA_CHAT_ID/);
    expect(() => validateEnv({ ...REQUIRED, LUNA_CHAT_ID: "-1" })).toThrow(/LUNA_CHAT_ID/);
  });

  it("returns valid config when all required vars are present", () => {
    const config = validateEnv(REQUIRED);
    expect(config.apiUrl).toBe("http://localhost:8080");
    expect(config.apiSecret).toBe("my-secret");
    expect(config.pollMs).toBe(2000);
    expect(config.chatId).toBe(123456);
  });

  it("uses TUI_POLL_MS when provided", () => {
    const config = validateEnv({ ...REQUIRED, TUI_POLL_MS: "5000" });
    expect(config.pollMs).toBe(5000);
  });

  it("falls back to default pollMs when TUI_POLL_MS is invalid", () => {
    const config = validateEnv({ ...REQUIRED, TUI_POLL_MS: "not-a-number" });
    expect(config.pollMs).toBe(2000);
  });

  it("uses DATA_DIR when provided", () => {
    const config = validateEnv({ ...REQUIRED, DATA_DIR: "/data/luna" });
    expect(config.dataDir).toBe("/data/luna");
  });

  it("defaults dataDir to cwd when DATA_DIR is absent", () => {
    const config = validateEnv(REQUIRED);
    expect(typeof config.dataDir).toBe("string");
    expect(config.dataDir.length).toBeGreaterThan(0);
  });

  it("parses LUNA_CHAT_ID as a number", () => {
    const config = validateEnv({ ...REQUIRED, LUNA_CHAT_ID: "42" });
    expect(config.chatId).toBe(42);
    expect(typeof config.chatId).toBe("number");
  });
});
