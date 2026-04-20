import { describe, expect, it } from "bun:test";
import type { User, UserRole } from "../../../src/entities/user.ts";

describe("User entity", () => {
  it("constructs a valid User", () => {
    const u: User = {
      telegramId: 42,
      githubLogin: "luis",
      role: "admin",
      createdAt: new Date(0),
    };
    expect(u.telegramId).toBe(42);
    expect(u.role).toBe("admin");
  });

  it("supports githubLogin as optional (undefined)", () => {
    const u: User = { telegramId: 1, role: "user", createdAt: new Date(0) };
    expect(u.githubLogin).toBeUndefined();
  });

  it("exhaustive UserRole narrow", () => {
    const roles: UserRole[] = ["admin", "user"];
    for (const r of roles) {
      const branded: UserRole = ((): UserRole => {
        switch (r) {
          case "admin":
            return "admin";
          case "user":
            return "user";
        }
      })();
      expect(branded).toBe(r);
    }
  });
});
