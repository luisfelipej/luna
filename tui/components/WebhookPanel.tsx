import React from "react";
import { Box, Text } from "ink";
import type { ApiClient } from "../api-client.ts";
import { usePoller } from "../use-poller.ts";

interface WebhookPanelProps {
  client: ApiClient;
  intervalMs?: number;
}

export function WebhookPanel({ client, intervalMs = 2000 }: WebhookPanelProps) {
  const state = usePoller(client.fetchWebhookStatus.bind(client), intervalMs);

  const headerColor = state.status === "error" ? "red" : "magenta";
  const headerSuffix =
    state.status === "loading"
      ? " [loading…]"
      : state.status === "error"
        ? ` [⚠ ${state.error}]`
        : "";

  const status = state.data;
  const endpoints = status?.endpoints ?? [];

  return (
    <Box borderStyle="single" flexDirection="column" paddingX={1}>
      <Text bold color={headerColor}>
        Webhooks{headerSuffix}
        {status ? (status.running ? " [running]" : " [stopped]") : ""}
      </Text>
      {endpoints.length === 0 ? (
        <Text dimColor>No webhooks configured</Text>
      ) : (
        endpoints.map((ep) => (
          <Box key={ep.name} flexDirection="row" gap={2}>
            <Text color={ep.enabled ? "green" : "red"}>{ep.enabled ? "●" : "○"}</Text>
            <Text>{ep.name}</Text>
            <Text dimColor>{ep.last_event_at ?? "Never"}</Text>
          </Box>
        ))
      )}
    </Box>
  );
}
