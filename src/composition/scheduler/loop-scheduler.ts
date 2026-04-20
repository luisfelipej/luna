import type { ClockPort } from "../../adapters/ports/clock.port.ts";
import type { JobRow, JobStore } from "../../adapters/ports/job-store.port.ts";
import type { SchedulerFire, SchedulerPort } from "../../adapters/ports/scheduler.port.ts";
import { nextFireAt } from "../../usecases/scheduler/next-fire-at.ts";

/**
 * Opaque timer handle — the minimum shape we need from `setTimeout`. Node's
 * `Timeout` object, Bun's Timer, and our `FakeTimers` all satisfy it.
 */
export type TimerHandle = unknown;

export type SetTimeoutShim = (cb: () => void, ms: number) => TimerHandle;
export type ClearTimeoutShim = (handle: TimerHandle | null | undefined) => void;

export interface LoopSchedulerOptions {
  readonly jobStore: JobStore;
  readonly clock: ClockPort;
  /** Defaults to global `setTimeout` if omitted. */
  readonly setTimeout?: SetTimeoutShim;
  /** Defaults to global `clearTimeout` if omitted. */
  readonly clearTimeout?: ClearTimeoutShim;
}

interface Entry {
  readonly jobId: number;
  dueMs: number;
}

/**
 * Single-timeout min-heap scheduler. Rebuilds the timeline on every mutation
 * (add/remove/rehydrate) — adequate for Luna's O(few-hundred) job ceiling and
 * trivially correct vs a priority queue.
 *
 * `start(fire)` installs the dispatch callback; jobs pre-existing in the
 * store are rehydrated via `rehydrate()` and past-due `once` jobs are fired
 * immediately by a zero-delay wake-up (see spec #45 catch-up scenarios).
 */
export class LoopScheduler implements SchedulerPort {
  private readonly jobStore: JobStore;
  private readonly clock: ClockPort;
  private readonly setT: SetTimeoutShim;
  private readonly clearT: ClearTimeoutShim;

  private entries: Entry[] = [];
  private timer: TimerHandle | null = null;
  private fire: SchedulerFire | null = null;
  private running = false;
  /** Jobs already caught-up-and-fired this boot; prevents re-fire. */
  private readonly caughtUp = new Set<number>();

  constructor(opts: LoopSchedulerOptions) {
    this.jobStore = opts.jobStore;
    this.clock = opts.clock;
    this.setT =
      opts.setTimeout ?? ((cb, ms) => globalThis.setTimeout(cb, ms) as unknown as TimerHandle);
    this.clearT =
      opts.clearTimeout ??
      ((h) => {
        if (h !== null && h !== undefined) {
          globalThis.clearTimeout(h as ReturnType<typeof setTimeout>);
        }
      });
  }

  async start(fire: SchedulerFire): Promise<void> {
    if (this.running) return;
    this.fire = fire;
    this.running = true;
    await this.rehydrate();
  }

  /** Rebuild the in-memory timeline from persistent state. */
  async rehydrate(): Promise<void> {
    this.entries = [];
    const rows = await this.jobStore.allActive();
    const nowMs = this.clock.nowMs();
    for (const row of rows) {
      if (row.schedule.kind === "once") {
        const at = Date.parse(row.schedule.atIso);
        if (!Number.isNaN(at) && at <= nowMs && row.firedAt === null) {
          // Past-due once job → fire immediately (spec catch-up).
          this.entries.push({ jobId: row.id, dueMs: nowMs });
          continue;
        }
      }
      try {
        const due = nextFireAt(row.schedule, nowMs);
        this.entries.push({ jobId: row.id, dueMs: due });
      } catch {
        // malformed schedule — skip rather than crash boot
      }
    }
    this.scheduleNext();
  }

  async register(job: JobRow): Promise<void> {
    // remove any stale entry for this id
    this.entries = this.entries.filter((e) => e.jobId !== job.id);
    try {
      const due = nextFireAt(job.schedule, this.clock.nowMs());
      this.entries.push({ jobId: job.id, dueMs: due });
    } catch {
      // malformed — just ignore
    }
    this.scheduleNext();
  }

  async unregister(jobId: number): Promise<void> {
    this.entries = this.entries.filter((e) => e.jobId !== jobId);
    this.scheduleNext();
  }

  async stop(): Promise<void> {
    this.running = false;
    if (this.timer !== null) {
      this.clearT(this.timer);
      this.timer = null;
    }
    this.entries = [];
    this.fire = null;
  }

  private scheduleNext(): void {
    if (!this.running) return;
    if (this.timer !== null) {
      this.clearT(this.timer);
      this.timer = null;
    }
    if (this.entries.length === 0) return;
    const earliest = this.entries.reduce((a, b) => (a.dueMs <= b.dueMs ? a : b));
    const delay = Math.max(0, earliest.dueMs - this.clock.nowMs());
    this.timer = this.setT(() => {
      void this.wake();
    }, delay);
  }

  private async wake(): Promise<void> {
    this.timer = null;
    if (!this.running) return;
    const nowMs = this.clock.nowMs();
    const due = this.entries.filter((e) => e.dueMs <= nowMs);
    // remove due entries — RunScheduledFire re-registers them afterwards.
    this.entries = this.entries.filter((e) => e.dueMs > nowMs);
    for (const entry of due) {
      if (this.fire) {
        try {
          await this.fire(entry.jobId);
        } catch {
          // swallow — never break the scheduler loop on a fire error
        }
      }
    }
    this.scheduleNext();
  }

  /** Internal: expose for diagnostics / tests. */
  get pendingIds(): readonly number[] {
    return this.entries.map((e) => e.jobId);
  }
}
