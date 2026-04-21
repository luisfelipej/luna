/**
 * Luna TUI — Read-Only Operator Monitoring Dashboard
 *
 * Phase 0 tracer: renders SessionPanel only.
 * Run: bun run tui
 *
 * Required env vars:
 *   LUNA_API_URL     — Luna server base URL, e.g. http://localhost:8080
 *   LUNA_API_SECRET  — Same value as GENERIC_WEBHOOK_SECRET on the server
 *
 * Optional env vars:
 *   TUI_POLL_MS      — Polling interval in ms (default: 2000)
 */
import React from "react";
import { render, useApp } from "ink";
import { validateEnv } from "./validate-env.ts";
import { createApiClient } from "./api-client.ts";
import { SessionPanel } from "./components/SessionPanel.tsx";

// ── Validate environment before rendering ─────────────────────────────────
let config: ReturnType<typeof validateEnv>;
try {
  config = validateEnv(process.env as Record<string, string | undefined>);
} catch (err) {
  const message = err instanceof Error ? err.message : String(err);
  process.stderr.write(`Luna TUI startup error: ${message}\n`);
  process.exit(1);
}

const client = createApiClient({ baseUrl: config.apiUrl, secret: config.apiSecret });

// ── Root App component ────────────────────────────────────────────────────
function App() {
  const { exit } = useApp();

  // Graceful shutdown on 'q' key
  // Note: Ink handles SIGINT/Ctrl+C automatically.
  process.on("SIGTERM", () => {
    exit();
    process.exit(0);
  });

  return <SessionPanel client={client} intervalMs={config.pollMs} />;
}

// ── Render ────────────────────────────────────────────────────────────────
render(<App />);
