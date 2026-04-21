import { join } from "node:path";

export interface LogLine {
  raw: string;
  parsed?: Record<string, unknown>;
}

/**
 * Computes the JSONL log file path for the given data directory and date.
 * Path: {dataDir}/history/{YYYY-MM-DD}.jsonl
 */
export function computeLogPath(dataDir: string, now: Date): string {
  const dateStr = now.toISOString().slice(0, 10); // YYYY-MM-DD
  return join(dataDir, "history", `${dateStr}.jsonl`);
}

/**
 * Reads the last N non-empty lines from the JSONL log file at `path`.
 * Returns [] when the file does not exist or cannot be read.
 * Each line is returned as a LogLine with raw text and optionally parsed JSON.
 */
export async function readLastN(path: string, n: number): Promise<LogLine[]> {
  let text: string;
  try {
    text = await Bun.file(path).text();
  } catch {
    // File missing, permission denied, or other I/O error — return empty.
    return [];
  }

  const lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  const last = lines.slice(-n);

  return last.map((raw) => {
    try {
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      return { raw, parsed };
    } catch {
      return { raw };
    }
  });
}
