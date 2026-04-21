import React from "react";
import { Box, Text } from "ink";
import type { ApiClient } from "../api-client.ts";
import { usePoller } from "../use-poller.ts";

interface SettingsPanelProps {
  client: ApiClient;
  intervalMs?: number;
}

export function SettingsPanel({ client, intervalMs = 2000 }: SettingsPanelProps) {
  const state = usePoller(client.fetchSettings.bind(client), intervalMs);

  const headerColor = state.status === "error" ? "red" : "white";
  const headerSuffix =
    state.status === "loading"
      ? " [loading…]"
      : state.status === "error"
        ? ` [⚠ ${state.error}]`
        : "";

  const entries = state.data ?? [];

  return (
    <Box borderStyle="single" flexDirection="column" paddingX={1}>
      <Text bold color={headerColor}>
        Settings{headerSuffix}
      </Text>
      {entries.length === 0 ? (
        <Text dimColor>All defaults</Text>
      ) : (
        entries.map((e) => (
          <Box key={e.key} flexDirection="row" gap={1}>
            <Text color="cyan">{e.key}</Text>
            <Text dimColor>=</Text>
            <Text>{e.value}</Text>
          </Box>
        ))
      )}
    </Box>
  );
}
