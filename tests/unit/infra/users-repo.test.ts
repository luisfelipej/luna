import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ConfigError } from "../../../src/entities/errors.ts";
import { UsersRepo } from "../../../src/infra/config/users-repo.ts";

describe("UsersRepo", () => {
  test("loads config/users.yaml.example", () => {
    const raw = readFileSync(join(process.cwd(), "config", "users.yaml.example"), "utf8");
    const repo = new UsersRepo(raw);
    const u = repo.byTelegramId(123456789);
    expect(u?.role).toBe("admin");
    expect(u?.model).toBe("sonnet");
  });

  test("malformed YAML throws ConfigError", () => {
    expect(() => new UsersRepo(":::not yaml:::\n  -[")).toThrow(ConfigError);
  });

  test("schema violation throws ConfigError", () => {
    expect(() => new UsersRepo("users:\n  - telegram_id: 'nope'\n")).toThrow(ConfigError);
  });
});
