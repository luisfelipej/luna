import { describe, expect, it } from "bun:test";
import { EnvSchema, loadEnv } from "../../../src/infra/config/env-schema.ts";
import { ConfigError } from "../../../src/entities/errors.ts";

const minimalValid = {
  TELEGRAM_BOT_TOKEN: "abc:def",
  TELEGRAM_ALLOWED_IDS: "42,43",
  WORKSPACE_BASE: "/tmp/ws",
  DATA_DIR: "/tmp/data",
};

describe("EnvSchema", () => {
  it("parses a valid minimal env", () => {
    const env = EnvSchema.parse(minimalValid);
    expect(env.TELEGRAM_BOT_TOKEN).toBe("abc:def");
    expect(env.TELEGRAM_ALLOWED_IDS).toEqual([42, 43]);
    expect(env.WORKSPACE_BASE).toBe("/tmp/ws");
    expect(env.DATA_DIR).toBe("/tmp/data");
    expect(env.HTTP_PORT).toBe(8080); // default
    expect(env.IDLE_TIMEOUT_MIN).toBe(15); // default
    expect(env.LOG_LEVEL).toBe("info"); // default
  });

  it("coerces HTTP_PORT from string", () => {
    const env = EnvSchema.parse({ ...minimalValid, HTTP_PORT: "9090" });
    expect(env.HTTP_PORT).toBe(9090);
    expect(typeof env.HTTP_PORT).toBe("number");
  });

  it("throws on missing TELEGRAM_BOT_TOKEN via loadEnv -> ConfigError", () => {
    const { TELEGRAM_BOT_TOKEN: _omit, ...rest } = minimalValid;
    expect(() => loadEnv(rest)).toThrow(ConfigError);
  });

  it("throws on invalid LOG_LEVEL", () => {
    expect(() => loadEnv({ ...minimalValid, LOG_LEVEL: "verbose" })).toThrow(ConfigError);
  });

  it("parses empty TELEGRAM_ALLOWED_IDS as empty array", () => {
    const env = EnvSchema.parse({ ...minimalValid, TELEGRAM_ALLOWED_IDS: "" });
    expect(env.TELEGRAM_ALLOWED_IDS).toEqual([]);
  });

  it("rejects malformed TELEGRAM_ALLOWED_IDS", () => {
    expect(() => loadEnv({ ...minimalValid, TELEGRAM_ALLOWED_IDS: "42,abc" })).toThrow(ConfigError);
  });

  it("parses optional LUNA_MODEL literal", () => {
    const env = EnvSchema.parse({ ...minimalValid, LUNA_MODEL: "opus" });
    expect(env.LUNA_MODEL).toBe("opus");
  });

  it("rejects unknown LUNA_MODEL value", () => {
    expect(() => loadEnv({ ...minimalValid, LUNA_MODEL: "gpt4" })).toThrow(ConfigError);
  });

  it("coerces LUNA_BUDGET_USD as non-negative number", () => {
    const env = EnvSchema.parse({ ...minimalValid, LUNA_BUDGET_USD: "2.5" });
    expect(env.LUNA_BUDGET_USD).toBe(2.5);
  });
});
