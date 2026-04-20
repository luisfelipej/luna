import { posix } from "node:path";
import type { FsPort } from "../../adapters/ports/fs.port.ts";
import type { ClockPort } from "../../adapters/ports/clock.port.ts";
import type { HistoryStore } from "../../adapters/ports/history-store.port.ts";
import type { MessageLine } from "../../entities/message.ts";

/**
 * Per-chat JSONL history, daily-rotated using UTC. Each message line is
 * appended as a single JSON object terminated by `\n` — downstream `tail(n)`
 * walks backwards across daily files when a single day has fewer than n
 * lines.
 *
 * File layout under `<rootDir>`:
 *   <rootDir>/<chatId>/<YYYY-MM-DD>.jsonl
 *
 * Atomicity: `FsPort.appendLine` is the atomicity unit — individual append
 * calls cannot interleave because they resolve sequentially inside the port
 * (Node's `fs.appendFile` uses `O_APPEND`; the MemFsPort fake is serial).
 */
export class JsonlHistoryStore implements HistoryStore {
  constructor(
    private readonly fs: FsPort,
    private readonly clock: ClockPort,
    private readonly rootDir: string,
  ) {}

  async append(chatId: number, line: MessageLine): Promise<void> {
    const ts = this.clock.now();
    const dayPath = this.pathFor(chatId, this.dayKey(ts));
    await this.fs.appendLine(dayPath, JSON.stringify(line));
  }

  async tail(chatId: number, n: number): Promise<MessageLine[]> {
    if (n <= 0) return [];
    const chatDir = posix.join(this.rootDir, String(chatId));
    let entries: string[] = [];
    try {
      entries = await this.fs.listDir(chatDir);
    } catch {
      return [];
    }
    // Daily files sort lexicographically by ISO YYYY-MM-DD.
    const days = entries.filter((f) => f.endsWith(".jsonl")).sort();
    const out: MessageLine[] = [];
    for (let i = days.length - 1; i >= 0 && out.length < n; i -= 1) {
      const file = days[i];
      if (!file) continue;
      const buf = await this.fs.readFile(posix.join(chatDir, file));
      const lines = buf
        .toString("utf8")
        .split("\n")
        .filter((s) => s.length > 0);
      for (let j = lines.length - 1; j >= 0 && out.length < n; j -= 1) {
        const raw = lines[j];
        if (!raw) continue;
        try {
          out.push(JSON.parse(raw) as MessageLine);
        } catch {
          // Skip malformed line — don't break the whole tail.
        }
      }
    }
    return out.reverse();
  }

  private pathFor(chatId: number, day: string): string {
    return posix.join(this.rootDir, String(chatId), `${day}.jsonl`);
  }

  private dayKey(d: Date): string {
    // YYYY-MM-DD in UTC.
    const y = d.getUTCFullYear().toString().padStart(4, "0");
    const m = (d.getUTCMonth() + 1).toString().padStart(2, "0");
    const day = d.getUTCDate().toString().padStart(2, "0");
    return `${y}-${m}-${day}`;
  }
}
