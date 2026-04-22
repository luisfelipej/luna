/**
 * Luna TUI — Read-Only Operator Monitoring Dashboard
 *
 * Renders 6 panels polling the Luna server monitoring API:
 *   Jobs | Sessions | Log tail | Webhooks | Workspaces | Settings
 *
 * Run: bun run tui
 *
 * Required env vars:
 *   LUNA_API_URL     — Luna server base URL, e.g. http://localhost:8080
 *   LUNA_API_SECRET  — Same value as GENERIC_WEBHOOK_SECRET on the server
 *
 * Optional env vars:
 *   TUI_POLL_MS      — Polling interval in ms (default: 2000)
 *   DATA_DIR         — Path to Luna data directory (default: cwd)
 *   LUNA_CHAT_ID     — Chat ID for log tail panel (enables per-chat log)
 */
import React, { useEffect } from "react";
import { render, useApp, useInput, Box, Text } from "ink";
import { validateEnv } from "./validate-env.ts";
import { createApiClient } from "./api-client.ts";
import { SessionPanel } from "./components/SessionPanel.tsx";
import { WorkspacePanel } from "./components/WorkspacePanel.tsx";
import { WebhookPanel } from "./components/WebhookPanel.tsx";
import { JobsPanel } from "./components/JobsPanel.tsx";
import { SettingsPanel } from "./components/SettingsPanel.tsx";
import { LogPanel } from "./components/LogPanel.tsx";

// ── Validate environment before rendering ─────────────────────────────────
let config: ReturnType<typeof validateEnv>;
try {
  config = validateEnv(process.env as Record<string, string | undefined>);
} catch (err) {
  const message = err instanceof Error ? err.message : String(err);
  process.stderr.write(`Luna TUI startup error: ${message}\n`);
  process.exit(1);
}

const client = createApiClient({
  baseUrl: config.apiUrl,
  secret: config.apiSecret,
  chatId: config.chatId,
});

// ── Root App component ────────────────────────────────────────────────────
function App() {
  const { exit } = useApp();

  // Graceful shutdown on 'q' key
  useInput((input) => {
    if (input === "q") {
      exit();
      process.exit(0);
    }
  });

  // SIGTERM handler
  useEffect(() => {
    const handler = () => {
      exit();
      process.exit(0);
    };
    process.on("SIGTERM", handler);
    return () => {
      process.off("SIGTERM", handler);
    };
  }, [exit]);

  return (
    <Box flexDirection="column">
      {/* Status bar */}
      <Box paddingX={1}>
        <Text dimColor>Luna TUI — Press </Text>
        <Text bold>q</Text>
        <Text dimColor> to quit</Text>
      </Box>

      {/* Main layout: left column + right column */}
      <Box flexDirection="row">
        {/* Left column: Jobs (top priority), Session, Settings */}
        <Box flexDirection="column" flexGrow={1}>
          <JobsPanel client={client} intervalMs={config.pollMs} />
          <SessionPanel client={client} intervalMs={config.pollMs} />
          <SettingsPanel client={client} intervalMs={config.pollMs} />
        </Box>

        {/* Right column: Log tail, Webhook, Workspace */}
        <Box flexDirection="column" flexGrow={1}>
          <LogPanel dataDir={config.dataDir} chatId={config.chatId} intervalMs={config.pollMs} />
          <WebhookPanel client={client} intervalMs={config.pollMs} />
          <WorkspacePanel client={client} intervalMs={config.pollMs} />
        </Box>
      </Box>
    </Box>
  );
}

// ── Render ────────────────────────────────────────────────────────────────
render(<App />);
