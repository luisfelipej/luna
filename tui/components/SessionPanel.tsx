import React from "react";
import { Box, Text } from "ink";
import type { ApiClient } from "../api-client.ts";
import { usePoller } from "../use-poller.ts";

interface SessionPanelProps {
  client: ApiClient;
  intervalMs?: number;
}

export function SessionPanel({ client, intervalMs = 2000 }: SessionPanelProps) {
  const state = usePoller(client.fetchSessions.bind(client), intervalMs);

  const headerColor = state.status === "error" ? "red" : "cyan";
  const headerSuffix =
    state.status === "loading"
      ? " [loading…]"
      : state.status === "error"
        ? ` [⚠ ${state.error}]`
        : "";

  const sessions = state.data ?? [];

  return (
    <Box borderStyle="single" flexDirection="column" paddingX={1}>
      <Text bold color={headerColor}>
        Sessions{headerSuffix}
      </Text>
      {sessions.length === 0 ? (
        <Text dimColor>No active sessions</Text>
      ) : (
        sessions.map((s) => (
          <Box key={s.chat_id} flexDirection="row" gap={2}>
            <Text color="green">chat {s.chat_id}</Text>
            <Text>{s.model}</Text>
            <Text color="yellow">${s.total_cost_usd.toFixed(4)}</Text>
            <Text dimColor>{s.last_used_at}</Text>
          </Box>
        ))
      )}
    </Box>
  );
}
