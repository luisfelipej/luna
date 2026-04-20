import { describe, expect, it } from "bun:test";
import { parseCommand } from "../../../src/usecases/telegram/parse-command.ts";
import { dispatchCommand } from "../../../src/usecases/telegram/dispatch-command.ts";

const p = (t: string) => parseCommand(t)!;

describe("dispatchCommand", () => {
  it("/new → resetSession", () => {
    expect(dispatchCommand(p("/new"))).toEqual({ kind: "resetSession" });
  });

  it("/stop → stopStream", () => {
    expect(dispatchCommand(p("/stop"))).toEqual({ kind: "stopStream" });
  });

  it("/model <name> → setModel with the name", () => {
    expect(dispatchCommand(p("/model opus"))).toEqual({
      kind: "setModel",
      model: "opus",
    });
  });

  it("/model without arg → replyError with usage", () => {
    const r = dispatchCommand(p("/model"));
    expect(r.kind).toBe("replyError");
  });

  it("/model bogus → replyError (unknown model)", () => {
    const r = dispatchCommand(p("/model bogus"));
    expect(r.kind).toBe("replyError");
  });

  it("/models → listModels", () => {
    expect(dispatchCommand(p("/models"))).toEqual({ kind: "listModels" });
  });

  it("/settings bare → showSettings", () => {
    expect(dispatchCommand(p("/settings"))).toEqual({ kind: "showSettings" });
  });

  it("/settings <field> <value> → setSetting", () => {
    expect(dispatchCommand(p("/settings model opus"))).toEqual({
      kind: "setSetting",
      field: "model",
      value: "opus",
    });
  });

  it("/settings reset <field> → resetSetting", () => {
    expect(dispatchCommand(p("/settings reset model"))).toEqual({
      kind: "resetSetting",
      field: "model",
    });
  });

  it("/help → showHelp", () => {
    expect(dispatchCommand(p("/help"))).toEqual({ kind: "showHelp" });
  });

  it("/stats → showStats", () => {
    expect(dispatchCommand(p("/stats"))).toEqual({ kind: "showStats" });
  });

  it("/webhooks → showWebhooks", () => {
    expect(dispatchCommand(p("/webhooks"))).toEqual({ kind: "showWebhooks" });
  });

  it("/workspace* → stubbed (Phase 10)", () => {
    for (const cmd of [
      "/workspace",
      "/ws",
      "/workspaces",
      "/workspace-new foo",
      "/workspace-home",
      "/workspace-allow /x",
      "/workspace-deny /x",
      "/workspace-allowed",
    ]) {
      const r = dispatchCommand(p(cmd));
      expect(r.kind).toBe("notImplemented");
      if (r.kind === "notImplemented") {
        expect(r.area).toBe("workspace");
      }
    }
  });

  it("/jobs lists jobs for the chat", () => {
    expect(dispatchCommand(p("/jobs"))).toEqual({ kind: "listJobs" });
  });

  it("/job <id> shows job details", () => {
    expect(dispatchCommand(p("/job 7"))).toEqual({ kind: "showJob", jobId: 7 });
  });

  it("/job cancel <id> cancels a job", () => {
    expect(dispatchCommand(p("/job cancel 9"))).toEqual({ kind: "cancelJob", jobId: 9 });
  });

  it("/job alone → usage", () => {
    const r = dispatchCommand(p("/job"));
    expect(r.kind).toBe("replyError");
  });

  it("/job <nonNumeric> → usage", () => {
    const r = dispatchCommand(p("/job abc"));
    expect(r.kind).toBe("replyError");
  });

  it("/jobs-info → scheduler stub still returns notImplemented in M1", () => {
    const r = dispatchCommand(p("/jobs-info"));
    // Acceptable: notImplemented OR a minimal placeholder. Ensure it's a known effect.
    expect(["notImplemented", "replyError"]).toContain(r.kind);
  });

  it("/jobs-cancel <id> cancels like /job cancel", () => {
    expect(dispatchCommand(p("/jobs-cancel 4"))).toEqual({ kind: "cancelJob", jobId: 4 });
  });

  it("unknown command → unknownCommand", () => {
    expect(dispatchCommand(p("/teleport"))).toEqual({
      kind: "unknownCommand",
      command: "teleport",
    });
  });
});
