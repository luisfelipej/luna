import type { AgentBackendPort } from "../../adapters/ports/agent-backend.port.ts";
import type { LoggerPort } from "../../adapters/ports/logger.port.ts";
import type { BackendConfig } from "../../entities/backend-config.ts";
import { BackendError } from "../../entities/errors.ts";
import type { StreamChunk } from "../../entities/stream-chunk.ts";
import { nodeSpawnPort } from "./node-spawn-port.ts";
import { createStreamJsonParser, framesToChunks, type ParsedFrame } from "./stream-json-parser.ts";
import type { SpawnPort, SpawnedProcess } from "./spawn-port.ts";

export interface ClaudeCodeBackendOptions {
  readonly spawn?: SpawnPort;
  readonly command?: string;
  readonly cwd?: string;
  readonly resumeSessionId?: (chatId: number) => string | null;
  readonly logger?: LoggerPort;
  /** Extra args injected before `--output-format` for test hooks. */
  readonly extraArgs?: readonly string[];
}

/**
 * Single-subprocess AgentBackendPort. One ClaudeCodeBackend instance wraps ONE
 * `claude` invocation for one chat; `BackendPool` (Task 5.5) owns the map of
 * instances.
 *
 * Lifecycle:
 *   ├── `send(chatId, text, cfg, signal)` spawns on first call (lazy).
 *   ├── subsequent calls reuse the child by writing another prompt to stdin.
 *   ├── `changeWorkspace` / `restart` SIGTERM + reset internal state.
 *   └── `shutdown` SIGTERM, wait briefly, SIGKILL fallback handled by pool.
 *
 * NOTE: M1 opts for one-shot invocation per `send` (spawn → stream → exit)
 * because the Claude CLI's stream-json mode is single-turn; session continuity
 * is achieved via `--resume <sid>` rather than long-lived stdin. This keeps
 * abort handling simple and avoids zombie processes.
 */
export class ClaudeCodeBackend implements AgentBackendPort {
  private readonly spawn: SpawnPort;
  private readonly command: string;
  private readonly cwd: string | undefined;
  private readonly resumeSessionId: (chatId: number) => string | null;
  private readonly logger: LoggerPort | undefined;
  private readonly extraArgs: readonly string[];

  private readonly live = new Map<number, SpawnedProcess>();

  constructor(opts: ClaudeCodeBackendOptions = {}) {
    this.spawn = opts.spawn ?? nodeSpawnPort;
    this.command = opts.command ?? "claude";
    this.cwd = opts.cwd;
    this.resumeSessionId = opts.resumeSessionId ?? (() => null);
    this.logger = opts.logger;
    this.extraArgs = opts.extraArgs ?? [];
  }

  async *send(
    chatId: number,
    text: string,
    cfg: BackendConfig,
    signal: AbortSignal,
  ): AsyncIterable<StreamChunk> {
    const args = this.buildArgs(chatId, cfg);
    const proc = this.spawn(this.command, args, {
      ...(this.cwd !== undefined ? { cwd: this.cwd } : {}),
    });
    this.live.set(chatId, proc);

    const abortHandler = () => proc.kill("SIGTERM");
    if (signal.aborted) {
      proc.kill("SIGTERM");
    } else {
      signal.addEventListener("abort", abortHandler, { once: true });
    }

    // Prompt payload: one assistant-framed user message.
    const payload = JSON.stringify({ type: "user", message: { role: "user", content: text } });
    proc.stdin.write(`${payload}\n`);
    proc.stdin.end();

    // Tee stderr into logger.
    void this.drainStderr(chatId, proc);

    const parser = createStreamJsonParser();
    try {
      for await (const bytes of proc.stdout) {
        const frames = parser.feed(bytes);
        for (const chunk of framesToChunks(frames)) {
          yield chunk;
        }
      }
      const tailFrames: ParsedFrame[] = parser.flush();
      for (const chunk of framesToChunks(tailFrames)) {
        yield chunk;
      }
    } finally {
      signal.removeEventListener("abort", abortHandler);
      this.live.delete(chatId);
      // Reap the process if still running.
      const code = await proc.exitCode;
      if (code !== 0 && code !== null && !signal.aborted) {
        this.logger?.warn("claude exited non-zero", { chatId, code });
      }
    }
  }

  private buildArgs(chatId: number, cfg: BackendConfig): string[] {
    const args = ["--output-format", "stream-json", "--input-format", "stream-json"];
    args.push("--model", cfg.model);
    const resume = this.resumeSessionId(chatId);
    if (resume) args.push("--resume", resume);
    for (const extra of this.extraArgs) args.push(extra);
    return args;
  }

  private async drainStderr(chatId: number, proc: SpawnedProcess): Promise<void> {
    const decoder = new TextDecoder();
    let buf = "";
    try {
      for await (const bytes of proc.stderr) {
        buf += decoder.decode(bytes, { stream: true });
        let idx: number;
        while ((idx = buf.indexOf("\n")) !== -1) {
          const line = buf.slice(0, idx);
          buf = buf.slice(idx + 1);
          if (line.trim() !== "") this.logger?.warn("claude stderr", { chatId, line });
        }
      }
      if (buf.trim() !== "") this.logger?.warn("claude stderr", { chatId, line: buf });
    } catch (err) {
      this.logger?.warn("claude stderr drain error", { chatId, err: String(err) });
    }
  }

  async changeWorkspace(chatId: number, _newCwd: string): Promise<void> {
    await this.restart(chatId);
  }

  async restart(chatId: number): Promise<void> {
    const proc = this.live.get(chatId);
    if (proc) {
      proc.kill("SIGTERM");
      this.live.delete(chatId);
    }
  }

  async shutdown(): Promise<void> {
    for (const [, proc] of this.live) proc.kill("SIGTERM");
    this.live.clear();
  }

  isAlive(chatId: number): boolean {
    return this.live.has(chatId);
  }
}

/** Guard used by the pool to surface a user-facing error when spawn fails. */
export function wrapBackendError(err: unknown): BackendError {
  if (err instanceof BackendError) return err;
  return new BackendError(err instanceof Error ? err.message : String(err), err);
}
