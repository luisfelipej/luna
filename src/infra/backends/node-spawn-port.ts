import { spawn } from "node:child_process";
import type { SpawnPort, SpawnedProcess, SpawnSignal } from "./spawn-port.ts";

/**
 * Real SpawnPort built on `node:child_process.spawn`. Only used in
 * LUNA_E2E=1 / real-mode boot. Unit/contract tests inject a fake.
 */
export const nodeSpawnPort: SpawnPort = (command, args, opts) => {
  const child = spawn(command, [...args], {
    stdio: ["pipe", "pipe", "pipe"],
    ...(opts?.cwd !== undefined ? { cwd: opts.cwd } : {}),
    ...(opts?.env !== undefined ? { env: opts.env } : {}),
  });

  async function* iterate(stream: NodeJS.ReadableStream | null): AsyncIterable<Uint8Array> {
    if (!stream) return;
    for await (const chunk of stream) {
      yield typeof chunk === "string" ? new TextEncoder().encode(chunk) : chunk;
    }
  }

  const exitCode = new Promise<number | null>((resolve) => {
    child.on("exit", (code) => resolve(code));
  });

  const proc: SpawnedProcess = {
    stdin: {
      write(chunk: string) {
        return child.stdin?.write(chunk) ?? false;
      },
      end() {
        child.stdin?.end();
      },
    },
    stdout: iterate(child.stdout),
    stderr: iterate(child.stderr),
    exitCode,
    kill(signal?: SpawnSignal) {
      if (typeof signal === "number") {
        child.kill(signal as unknown as NodeJS.Signals);
      } else {
        child.kill(signal ?? "SIGTERM");
      }
    },
  };
  return proc;
};
