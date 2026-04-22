const DEFAULT_POLL_MS = 2000;

export interface TuiConfig {
  apiUrl: string;
  apiSecret: string;
  pollMs: number;
  dataDir: string;
  chatId: number;
}

/**
 * Validates environment variables required by the TUI.
 * Throws a descriptive error if required vars are missing.
 *
 * @param env - Partial env dict (defaults to `process.env`)
 */
export function validateEnv(
  env: Partial<Record<string, string | undefined>> = process.env,
): TuiConfig {
  const apiUrl = env["LUNA_API_URL"];
  if (!apiUrl) {
    throw new Error(
      "LUNA_API_URL is required. Set it to the Luna server base URL, e.g. http://localhost:8080",
    );
  }

  const apiSecret = env["LUNA_API_SECRET"];
  if (!apiSecret) {
    throw new Error(
      "LUNA_API_SECRET is required. Set it to the same value as GENERIC_WEBHOOK_SECRET on the server.",
    );
  }

  const pollMsRaw = env["TUI_POLL_MS"];
  const parsedPollMs = pollMsRaw !== undefined ? Number(pollMsRaw) : NaN;
  const pollMs = Number.isFinite(parsedPollMs) && parsedPollMs > 0 ? parsedPollMs : DEFAULT_POLL_MS;

  // DATA_DIR: optional — defaults to cwd. Used by LogPanel for JSONL tail.
  const dataDir = env["DATA_DIR"] ?? process.cwd();

  // LUNA_CHAT_ID: required — used to filter per-chat API responses and log tail.
  const chatIdRaw = env["LUNA_CHAT_ID"];
  if (!chatIdRaw) {
    throw new Error("LUNA_CHAT_ID is required. Set it to your Telegram chat ID (a numeric value).");
  }
  const chatId = Number(chatIdRaw);
  if (!Number.isInteger(chatId) || chatId <= 0) {
    throw new Error(`LUNA_CHAT_ID must be a positive integer, got: ${chatIdRaw}`);
  }

  return { apiUrl, apiSecret, pollMs, dataDir, chatId };
}
