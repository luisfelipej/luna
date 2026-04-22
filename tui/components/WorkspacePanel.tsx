import React from "react";
import { Box, Text } from "ink";
import type { ApiClient } from "../api-client.ts";
import { usePoller } from "../use-poller.ts";

interface WorkspacePanelProps {
  client: ApiClient;
  intervalMs?: number;
}

/** Truncate a path to fit within maxWidth, adding … prefix if needed. */
function truncatePath(p: string, maxWidth: number): string {
  if (p.length <= maxWidth) return p;
  // Keep the end of the path (most informative part)
  return "…" + p.slice(-(maxWidth - 1));
}

export function WorkspacePanel({ client, intervalMs = 2000 }: WorkspacePanelProps) {
  const state = usePoller(client.fetchWorkspaces.bind(client), intervalMs);

  const headerColor = state.status === "error" ? "red" : "yellow";
  const headerSuffix =
    state.status === "loading"
      ? " [loading…]"
      : state.status === "error"
        ? ` [⚠ ${state.error}]`
        : "";

  const workspaces = state.data ?? [];
  // Group by chat_id
  const byChat = new Map<number, string[]>();
  for (const w of workspaces) {
    const arr = byChat.get(w.chat_id) ?? [];
    arr.push(w.path);
    byChat.set(w.chat_id, arr);
  }

  const maxPathWidth = Math.max(40, (process.stdout.columns ?? 80) - 20);

  return (
    <Box borderStyle="single" flexDirection="column" paddingX={1}>
      <Text bold color={headerColor}>
        Workspaces{headerSuffix}
      </Text>
      {workspaces.length === 0 ? (
        <Text dimColor>No workspaces configured</Text>
      ) : (
        [...byChat.entries()].map(([chatId, paths]) => (
          <Box key={chatId} flexDirection="column">
            <Text color="cyan">chat {chatId}</Text>
            {paths.length === 0 ? (
              <Text dimColor> No restrictions</Text>
            ) : (
              paths.map((p) => (
                <Text key={p} dimColor>
                  {"  "}
                  {truncatePath(p, maxPathWidth)}
                </Text>
              ))
            )}
          </Box>
        ))
      )}
    </Box>
  );
}
