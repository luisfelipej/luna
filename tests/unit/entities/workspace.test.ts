import { describe, expect, it } from "bun:test";
import type { Workspace } from "../../../src/entities/workspace.ts";

describe("Workspace entity", () => {
  it("constructs a valid Workspace", () => {
    const w: Workspace = {
      chatId: 42,
      path: "/home/luis/code/luna",
      addedAt: new Date(1000),
      lastUsedAt: new Date(2000),
    };
    expect(w.path).toBe("/home/luis/code/luna");
    expect(w.lastUsedAt?.getTime()).toBe(2000);
  });

  it("allows lastUsedAt to be null (never used)", () => {
    const w: Workspace = {
      chatId: 1,
      path: "/w",
      addedAt: new Date(0),
      lastUsedAt: null,
    };
    expect(w.lastUsedAt).toBeNull();
  });
});
