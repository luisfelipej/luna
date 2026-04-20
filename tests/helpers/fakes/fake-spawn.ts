import type {
  SpawnPort,
  SpawnedProcess,
  SpawnSignal,
} from "../../../src/infra/backends/spawn-port.ts";

/**
 * Scriptable SpawnPort for tests. Records every spawn call + collects stdin
 * writes; emits scripted stdout/stderr lines on a controllable schedule.
 */
export interface FakeSpawnCall {
  command: string;
  args: string[];
  cwd: string | undefined;
  stdinWrites: string[];
  killed: SpawnSignal | null;
  resolveExit: (code: number | null) => void;
  stdoutQueue: AsyncQueue<Uint8Array>;
  stderrQueue: AsyncQueue<Uint8Array>;
  emitStdoutLine(line: string): void;
  emitStderrLine(line: string): void;
  finish(code?: number): void;
}

export class FakeSpawn {
  readonly calls: FakeSpawnCall[] = [];

  /**
   * The SpawnPort function. Pass this as the `spawn` dep to ClaudeCodeBackend.
   */
  readonly spawn: SpawnPort = (command, args, opts): SpawnedProcess => {
    const stdoutQueue = new AsyncQueue<Uint8Array>();
    const stderrQueue = new AsyncQueue<Uint8Array>();
    let resolveExit!: (code: number | null) => void;
    const exitPromise = new Promise<number | null>((res) => {
      resolveExit = res;
    });

    const call: FakeSpawnCall = {
      command,
      args: [...args],
      cwd: opts?.cwd,
      stdinWrites: [],
      killed: null,
      resolveExit,
      stdoutQueue,
      stderrQueue,
      emitStdoutLine(line) {
        stdoutQueue.push(new TextEncoder().encode(line.endsWith("\n") ? line : `${line}\n`));
      },
      emitStderrLine(line) {
        stderrQueue.push(new TextEncoder().encode(line.endsWith("\n") ? line : `${line}\n`));
      },
      finish(code = 0) {
        stdoutQueue.close();
        stderrQueue.close();
        resolveExit(code);
      },
    };
    this.calls.push(call);

    const proc: SpawnedProcess = {
      stdin: {
        write(chunk: string) {
          call.stdinWrites.push(chunk);
          return true;
        },
        end() {},
      },
      stdout: stdoutQueue,
      stderr: stderrQueue,
      exitCode: exitPromise,
      kill(signal?: SpawnSignal) {
        call.killed = signal ?? "SIGTERM";
        stdoutQueue.close();
        stderrQueue.close();
        resolveExit(null);
      },
    };
    return proc;
  };

  get last(): FakeSpawnCall | undefined {
    return this.calls[this.calls.length - 1];
  }
}

/** One-producer one-consumer async queue. */
export class AsyncQueue<T> implements AsyncIterable<T> {
  private readonly items: T[] = [];
  private readonly waiters: Array<(r: IteratorResult<T>) => void> = [];
  private done = false;

  push(item: T): void {
    const waiter = this.waiters.shift();
    if (waiter) waiter({ value: item, done: false });
    else this.items.push(item);
  }

  close(): void {
    this.done = true;
    while (this.waiters.length > 0) {
      const w = this.waiters.shift();
      if (w) w({ value: undefined, done: true });
    }
  }

  [Symbol.asyncIterator](): AsyncIterator<T> {
    return {
      next: (): Promise<IteratorResult<T>> => {
        if (this.items.length > 0) {
          const value = this.items.shift() as T;
          return Promise.resolve({ value, done: false });
        }
        if (this.done) return Promise.resolve({ value: undefined, done: true });
        return new Promise((res) => this.waiters.push(res));
      },
    };
  }
}
