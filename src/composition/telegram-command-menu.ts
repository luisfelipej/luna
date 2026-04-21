/**
 * Slash-command menu published to Telegram via `setMyCommands` on boot.
 * Drives the `/` autocomplete popup in the chat UI.
 *
 * Telegram caps: 32 commands max, 1-32 chars each (lowercase + digits + _),
 * descriptions 1-256 chars. Only the short name goes here (no arguments).
 */
export const LUNA_COMMAND_MENU: ReadonlyArray<{ command: string; description: string }> = [
  { command: "new", description: "Clear session and start fresh" },
  { command: "stop", description: "Interrupt the current response" },
  { command: "help", description: "Show available commands" },
  { command: "stats", description: "Session info, model and cost" },
  { command: "model", description: "Switch model (opus|sonnet|haiku)" },
  { command: "models", description: "List available models" },
  { command: "settings", description: "Show or change per-user settings" },
  { command: "workspace", description: "Show or switch workspace" },
  { command: "workspaces", description: "List allowed workspaces" },
  { command: "jobs", description: "List scheduled jobs" },
  { command: "job", description: "Job info or cancel <id>" },
  { command: "webhooks", description: "Show HTTP server status" },
];
