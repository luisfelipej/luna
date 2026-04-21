import React, { useEffect, useState } from "react";
import { Box, Text } from "ink";
import { computeLogPath, readLastN } from "../log-tail.ts";
import type { LogLine } from "../log-tail.ts";

const MAX_LINES = 20;

interface LogPanelProps {
  dataDir: string;
  chatId: string;
  intervalMs?: number;
}

interface LogState {
  lines: LogLine[];
  error: string | null;
  loading: boolean;
}

/** Format a parsed log line for display. */
function formatLine(line: LogLine): string {
  if (line.parsed) {
    const p = line.parsed;
    // Pino-style: {time, level, msg, ...}
    const time = typeof p.time === "number" ? new Date(p.time).toISOString().slice(11, 19) : "";
    const level = typeof p.level === "number" ? levelLabel(p.level) : (p.level ?? "");
    const msg = typeof p.msg === "string" ? p.msg : line.raw;
    return `${time} ${level} ${msg}`.trim();
  }
  return line.raw;
}

function levelLabel(n: number): string {
  if (n >= 50) return "ERROR";
  if (n >= 40) return "WARN ";
  if (n >= 30) return "INFO ";
  if (n >= 20) return "DEBUG";
  return "TRACE";
}

function levelColor(line: LogLine): string | undefined {
  if (!line.parsed) return undefined;
  const n = typeof line.parsed.level === "number" ? line.parsed.level : 0;
  if (n >= 50) return "red";
  if (n >= 40) return "yellow";
  return undefined;
}

export function LogPanel({ dataDir, chatId, intervalMs = 2000 }: LogPanelProps) {
  const [state, setState] = useState<LogState>({ lines: [], error: null, loading: true });

  useEffect(() => {
    let cancelled = false;

    async function tick() {
      // If chatId is empty, we can't compute a meaningful path — skip.
      if (!chatId) {
        if (!cancelled) setState({ lines: [], error: null, loading: false });
        return;
      }
      try {
        const logPath = computeLogPath(dataDir, new Date());
        const lines = await readLastN(logPath, MAX_LINES);
        if (!cancelled) setState({ lines, error: null, loading: false });
      } catch (err) {
        if (!cancelled) {
          setState((prev) => ({
            lines: prev.lines,
            error: err instanceof Error ? err.message : String(err),
            loading: false,
          }));
        }
      }
    }

    void tick();
    const timer = setInterval(tick, intervalMs);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [dataDir, chatId, intervalMs]);

  const headerColor = state.error ? "red" : "green";
  const headerSuffix = state.loading ? " [loading…]" : state.error ? ` [⚠ ${state.error}]` : "";

  return (
    <Box borderStyle="single" flexDirection="column" paddingX={1}>
      <Text bold color={headerColor}>
        Agent Log{headerSuffix}
      </Text>
      {!chatId ? (
        <Text dimColor>Set LUNA_CHAT_ID to enable log tail</Text>
      ) : state.lines.length === 0 ? (
        <Text dimColor>No log entries today</Text>
      ) : (
        state.lines.map((line, i) => (
          <Text key={i} color={levelColor(line)}>
            {formatLine(line)}
          </Text>
        ))
      )}
    </Box>
  );
}
