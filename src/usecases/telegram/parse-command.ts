/**
 * Syntactic parse of a Telegram text body into a `/command` envelope.
 *
 * Pure: zero I/O, zero side effects. The Telegram presenter calls this for
 * every inbound text message; commands flow to `dispatchCommand`, non-commands
 * flow to `SendMessageToAgent`.
 *
 * Semantics:
 *   - Leading/trailing whitespace is trimmed.
 *   - A command MUST start with `/`. Non-command input returns `null`.
 *   - The token after `/` is lowercased; `@botname` suffix (grammY style) is
 *     stripped.
 *   - Args are whitespace-separated and keep their original case. `raw`
 *     holds the untokenised argument string for commands that want the
 *     remainder verbatim (e.g. `/settings`).
 */

export interface ParsedCommand {
  readonly command: string;
  readonly args: readonly string[];
  readonly raw: string;
}

/**
 * The exhaustive M1 command surface. `dispatchCommand` consults this to tell
 * known-but-stubbed commands (workspace/jobs in Phase 6) from genuinely
 * unknown commands.
 */
export const KNOWN_COMMANDS: ReadonlySet<string> = new Set([
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
]);

export function parseCommand(text: string): ParsedCommand | null {
  const trimmed = text.trim();
  if (!trimmed.startsWith("/")) return null;
  const body = trimmed.slice(1);
  if (body === "") return null;

  // Split head / remainder on the first whitespace run.
  const firstSpace = body.search(/\s/);
  const head = firstSpace === -1 ? body : body.slice(0, firstSpace);
  const remainder = firstSpace === -1 ? "" : body.slice(firstSpace).trim();

  const atIdx = head.indexOf("@");
  const commandToken = atIdx === -1 ? head : head.slice(0, atIdx);
  if (commandToken === "") return null;
  const command = commandToken.toLowerCase();

  const args = remainder === "" ? [] : remainder.split(/\s+/);
  return { command, args, raw: remainder };
}
