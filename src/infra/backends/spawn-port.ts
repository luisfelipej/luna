/**
 * Tiny DI seam around `node:child_process.spawn`. Lets tests drive a scripted
 * fake subprocess without touching the real `claude` binary.
 *
 * Kept inside infra (and NOT promoted to adapters/ports) because only the
 * Claude backend needs it; a leak to usecases would be a clean-arch smell.
 */

export type SpawnSignal = "SIGTERM" | "SIGKILL" | "SIGINT" | number;

export interface SpawnedProcess {
  readonly stdin: {
    write(chunk: string): boolean;
    end(): void;
  };
  readonly stdout: AsyncIterable<Uint8Array>;
  readonly stderr: AsyncIterable<Uint8Array>;
  readonly exitCode: Promise<number | null>;
  kill(signal?: SpawnSignal): void;
}

export interface SpawnOptions {
  readonly cwd?: string;
  readonly env?: Record<string, string>;
}

export type SpawnPort = (
  command: string,
  args: readonly string[],
  opts?: SpawnOptions,
) => SpawnedProcess;
