import { describe, expect, it } from "bun:test";
import { WorkspacesYamlSchema } from "../../../src/infra/config/workspaces-yaml-schema.ts";

describe("WorkspacesYamlSchema", () => {
  it("parses a minimal valid config", () => {
    const parsed = WorkspacesYamlSchema.parse({ workspaces: [{ path: "/w/a" }] });
    expect(parsed.workspaces[0]!.path).toBe("/w/a");
  });

  it("parses a maximal valid config", () => {
    const parsed = WorkspacesYamlSchema.parse({
      workspaces: [
        {
          path: "/w/a",
          system_prompt: "Be concise",
          claude: {
            model: "sonnet",
            timeout_s: 60,
            budget_usd: 1,
            context_window: 100000,
          },
        },
      ],
    });
    expect(parsed.workspaces[0]!.claude?.model).toBe("sonnet");
  });

  it("rejects unknown model", () => {
    expect(() =>
      WorkspacesYamlSchema.parse({
        workspaces: [{ path: "/w/a", claude: { model: "gpt4" } }],
      }),
    ).toThrow();
  });

  it("rejects missing path", () => {
    expect(() => WorkspacesYamlSchema.parse({ workspaces: [{}] })).toThrow();
  });
});
