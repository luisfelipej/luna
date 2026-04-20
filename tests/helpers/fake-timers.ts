import type { VirtualClock } from "./virtual-clock.ts";

/**
 * Deterministic timer scheduler paired with a VirtualClock. Tests drive
 * virtual time via `advance(ms)`; any timers whose deadline falls in that
 * window fire in order. Integrates with the LoopScheduler's `Timers` shim.
 */
export interface TimerHandle {
  readonly id: number;
  readonly deadlineMs: number;
}

export class FakeTimers {
  private readonly clock: VirtualClock;
  private readonly pending: Array<{ id: number; deadlineMs: number; cb: () => void }> = [];
  private seq = 0;

  constructor(clock: VirtualClock) {
    this.clock = clock;
  }

  setTimeout = (cb: () => void, ms: number): TimerHandle => {
    this.seq += 1;
    const id = this.seq;
    const deadlineMs = this.clock.nowMs() + Math.max(0, ms);
    this.pending.push({ id, deadlineMs, cb });
    return { id, deadlineMs };
  };

  clearTimeout = (handle: TimerHandle | null | undefined): void => {
    if (!handle) return;
    const idx = this.pending.findIndex((p) => p.id === handle.id);
    if (idx >= 0) this.pending.splice(idx, 1);
  };

  /**
   * Advance virtual time by `ms` and fire all timers whose deadline falls
   * within the new time window. Timers are fired one at a time in deadline
   * order so that a callback scheduling a new timer interleaves correctly.
   */
  async advance(ms: number): Promise<void> {
    const target = this.clock.nowMs() + ms;
    while (true) {
      const due = this.pending
        .filter((p) => p.deadlineMs <= target)
        .sort((a, b) => a.deadlineMs - b.deadlineMs)[0];
      if (!due) break;
      this.pending.splice(this.pending.indexOf(due), 1);
      this.clock.setNow(due.deadlineMs);
      due.cb();
      // Let any microtasks (awaits inside the cb) settle.
      await Promise.resolve();
      await Promise.resolve();
    }
    this.clock.setNow(target);
  }

  /** Count of pending timers — useful for leak assertions. */
  get pendingCount(): number {
    return this.pending.length;
  }
}
