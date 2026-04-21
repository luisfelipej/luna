import React from "react";
import { Box, Text } from "ink";
import type { ApiClient } from "../api-client.ts";
import { usePoller } from "../use-poller.ts";

interface JobsPanelProps {
  client: ApiClient;
  intervalMs?: number;
}

export function JobsPanel({ client, intervalMs = 2000 }: JobsPanelProps) {
  const state = usePoller(client.fetchJobs.bind(client), intervalMs);

  const headerColor = state.status === "error" ? "red" : "blue";
  const headerSuffix =
    state.status === "loading"
      ? " [loading…]"
      : state.status === "error"
        ? ` [⚠ ${state.error}]`
        : "";

  const jobs = state.data ?? [];

  return (
    <Box borderStyle="single" flexDirection="column" paddingX={1}>
      <Text bold color={headerColor}>
        Jobs{headerSuffix}
      </Text>
      {jobs.length === 0 ? (
        <Text dimColor>No scheduled jobs</Text>
      ) : (
        jobs.map((job) => (
          <Box key={job.id} flexDirection="row" gap={2}>
            <Text color={job.active ? "green" : "yellow"}>{job.active ? "▶" : "⏸"}</Text>
            <Text bold>#{job.id}</Text>
            <Text>{job.name}</Text>
            <Text dimColor>[chat {job.chat_id}]</Text>
            <Text dimColor>{job.fired_at ? `last: ${job.fired_at}` : "not fired"}</Text>
          </Box>
        ))
      )}
    </Box>
  );
}
