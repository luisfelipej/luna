import type { Model } from "../../entities/backend-config.ts";
import { KNOWN_COMMANDS, type ParsedCommand } from "./parse-command.ts";

/**
 * Effect descriptor the dispatcher returns. Keeping it a discriminated union
 * of data means `dispatchCommand` is a pure function — the presenter
 * (infra) owns the actual effect execution.
 */
export type CommandEffect =
  | { readonly kind: "resetSession" }
  | { readonly kind: "stopStream" }
  | { readonly kind: "setModel"; readonly model: Model }
  | { readonly kind: "listModels" }
  | { readonly kind: "showSettings" }
  | { readonly kind: "setSetting"; readonly field: string; readonly value: string }
  | { readonly kind: "resetSetting"; readonly field: string }
  | { readonly kind: "showHelp" }
  | { readonly kind: "showStats" }
  | { readonly kind: "showWebhooks" }
  | { readonly kind: "listJobs" }
  | { readonly kind: "showJob"; readonly jobId: number }
  | { readonly kind: "cancelJob"; readonly jobId: number }
  | { readonly kind: "notImplemented"; readonly area: "workspace" | "jobs" }
  | { readonly kind: "unknownCommand"; readonly command: string }
  | { readonly kind: "replyError"; readonly message: string };

const WORKSPACE_CMDS = new Set([
  "workspace",
  "ws",
  "workspaces",
  "workspace-new",
  "workspace-home",
  "workspace-allow",
  "workspace-deny",
  "workspace-allowed",
]);

const JOB_CMDS = new Set(["job", "jobs", "jobs-info", "jobs-cancel"]);

const MODELS: ReadonlySet<Model> = new Set(["opus", "sonnet", "haiku"]);

/**
 * Pure dispatch: map a parsed command to an effect descriptor. Performs
 * syntactic argument validation only — execution is the presenter's job.
 */
export function dispatchCommand(cmd: ParsedCommand): CommandEffect {
  const { command, args } = cmd;

  if (!KNOWN_COMMANDS.has(command)) {
    return { kind: "unknownCommand", command };
  }

  switch (command) {
    case "new":
      return { kind: "resetSession" };
    case "stop":
      return { kind: "stopStream" };
    case "help":
      return { kind: "showHelp" };
    case "stats":
      return { kind: "showStats" };
    case "webhooks":
      return { kind: "showWebhooks" };
    case "models":
      return { kind: "listModels" };
    case "model": {
      const name = args[0];
      if (name === undefined) {
        return { kind: "replyError", message: "Usage: /model <opus|sonnet|haiku>" };
      }
      if (!MODELS.has(name as Model)) {
        return { kind: "replyError", message: `Unknown model: ${name}` };
      }
      return { kind: "setModel", model: name as Model };
    }
    case "settings": {
      const [first, second] = args;
      if (first === undefined) return { kind: "showSettings" };
      if (first === "reset") {
        if (second === undefined) {
          return { kind: "replyError", message: "Usage: /settings reset <field>" };
        }
        return { kind: "resetSetting", field: second };
      }
      if (second === undefined) {
        return { kind: "replyError", message: "Usage: /settings <field> <value>" };
      }
      return { kind: "setSetting", field: first, value: second };
    }
    case "jobs":
      return { kind: "listJobs" };
    case "job": {
      const [first, second] = args;
      if (first === undefined) {
        return { kind: "replyError", message: "Usage: /job <id> | /job cancel <id>" };
      }
      if (first === "cancel") {
        if (second === undefined) {
          return { kind: "replyError", message: "Usage: /job cancel <id>" };
        }
        const cid = Number(second);
        if (!Number.isFinite(cid) || cid <= 0) {
          return { kind: "replyError", message: "Invalid job id" };
        }
        return { kind: "cancelJob", jobId: cid };
      }
      const n = Number(first);
      if (!Number.isFinite(n) || n <= 0) {
        return { kind: "replyError", message: "Invalid job id" };
      }
      return { kind: "showJob", jobId: n };
    }
    case "jobs-cancel": {
      const [first] = args;
      if (first === undefined) {
        return { kind: "replyError", message: "Usage: /jobs-cancel <id>" };
      }
      const cid = Number(first);
      if (!Number.isFinite(cid) || cid <= 0) {
        return { kind: "replyError", message: "Invalid job id" };
      }
      return { kind: "cancelJob", jobId: cid };
    }
    case "jobs-info":
      // M1 exposes only /jobs, /job <id>, /job cancel <id>; keep /jobs-info as
      // a stub so the command surface stays recognised but unimplemented.
      return { kind: "notImplemented", area: "jobs" };
    default:
      if (WORKSPACE_CMDS.has(command)) return { kind: "notImplemented", area: "workspace" };
      if (JOB_CMDS.has(command)) return { kind: "notImplemented", area: "jobs" };
      return { kind: "unknownCommand", command };
  }
}
