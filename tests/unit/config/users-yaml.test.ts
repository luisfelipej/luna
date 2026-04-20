import { describe, expect, it } from "bun:test";
import { UsersYamlSchema } from "../../../src/infra/config/users-yaml-schema.ts";

describe("UsersYamlSchema", () => {
  it("parses a minimal valid config", () => {
    const parsed = UsersYamlSchema.parse({ users: [{ telegram_id: 42 }] });
    expect(parsed.users[0]!.telegram_id).toBe(42);
    expect(parsed.users[0]!.role).toBe("user");
  });

  it("parses a maximal valid config", () => {
    const parsed = UsersYamlSchema.parse({
      users: [
        {
          telegram_id: 42,
          github_login: "luis",
          role: "admin",
          model: "opus",
          timeout_s: 300,
          budget_usd: 5,
          context_window: 200000,
        },
      ],
    });
    expect(parsed.users[0]!.role).toBe("admin");
    expect(parsed.users[0]!.model).toBe("opus");
  });

  it("rejects unknown role", () => {
    expect(() =>
      UsersYamlSchema.parse({ users: [{ telegram_id: 1, role: "superuser" }] }),
    ).toThrow();
  });

  it("rejects non-integer telegram_id", () => {
    expect(() => UsersYamlSchema.parse({ users: [{ telegram_id: 1.5 }] })).toThrow();
  });

  it("rejects negative budget_usd", () => {
    expect(() =>
      UsersYamlSchema.parse({ users: [{ telegram_id: 1, budget_usd: -1 }] }),
    ).toThrow();
  });
});
