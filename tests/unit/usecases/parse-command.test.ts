import { describe, expect, it } from "bun:test";
import { KNOWN_COMMANDS, parseCommand } from "../../../src/usecases/telegram/parse-command.ts";

describe("parseCommand", () => {
  it("returns null for non-command text", () => {
    expect(parseCommand("hello world")).toBeNull();
    expect(parseCommand("")).toBeNull();
    expect(parseCommand("   ")).toBeNull();
    expect(parseCommand("not/a/command")).toBeNull();
  });

  it("strips the leading slash and returns command + empty args", () => {
    expect(parseCommand("/new")).toEqual({ command: "new", args: [], raw: "" });
    expect(parseCommand("/help")).toEqual({ command: "help", args: [], raw: "" });
  });

  it("splits whitespace-separated args", () => {
    expect(parseCommand("/model opus")).toEqual({ command: "model", args: ["opus"], raw: "opus" });
    expect(parseCommand("/settings reset model")).toEqual({
      command: "settings",
      args: ["reset", "model"],
      raw: "reset model",
    });
  });

  it("handles multiple spaces and leading/trailing whitespace", () => {
    expect(parseCommand("  /jobs   7  ")).toEqual({
      command: "jobs",
      args: ["7"],
      raw: "7",
    });
  });

  it("drops the @botname suffix (grammY-style)", () => {
    expect(parseCommand("/new@lunabot")).toEqual({ command: "new", args: [], raw: "" });
    expect(parseCommand("/model@lunabot opus")).toEqual({
      command: "model",
      args: ["opus"],
      raw: "opus",
    });
  });

  it("lowercases the command name but preserves arg case", () => {
    expect(parseCommand("/Model Opus")).toEqual({ command: "model", args: ["Opus"], raw: "Opus" });
  });

  it("exposes the full known-command set (20 entries)", () => {
    // All commands the dispatcher must accept in M1.
    for (const c of [
      "new",
      "stop",
      "model",
      "models",
      "settings",
      "workspace",
      "ws",
      "workspace-new",
      "workspace-home",
      "workspace-allow",
      "workspace-deny",
      "workspace-allowed",
      "workspaces",
      "job",
      "jobs",
      "jobs-info",
      "jobs-cancel",
      "webhooks",
      "help",
      "stats",
    ]) {
      expect(KNOWN_COMMANDS.has(c)).toBe(true);
    }
  });

  it("still parses unknown commands (dispatcher decides)", () => {
    // parse-command is syntactic; semantic unknown-command handling lives in
    // the dispatcher so help-on-unknown can still show the user a hint.
    expect(parseCommand("/teleport go")).toEqual({
      command: "teleport",
      args: ["go"],
      raw: "go",
    });
  });
});
