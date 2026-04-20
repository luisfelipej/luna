import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ConfigError } from "../../../src/entities/errors.ts";
import { WorkspacesRepo } from "../../../src/infra/config/workspaces-repo.ts";

describe("WorkspacesRepo", () => {
  test("loads config/workspaces.yaml.example", () => {
    const raw = readFileSync(join(process.cwd(), "config", "workspaces.yaml.example"), "utf8");
    const repo = new WorkspacesRepo(raw);
    const ws = repo.byPath("/home/you/code/example");
    expect(ws?.claude?.model).toBe("sonnet");
  });

  test("malformed YAML throws ConfigError", () => {
    expect(() => new WorkspacesRepo("::not yaml::\n  -[")).toThrow(ConfigError);
  });

  test("schema violation throws ConfigError", () => {
    expect(() => new WorkspacesRepo("workspaces:\n  - path: ''\n")).toThrow(ConfigError);
  });
});
