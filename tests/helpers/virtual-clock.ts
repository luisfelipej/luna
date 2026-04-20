import type { ClockPort } from "../../src/adapters/ports/clock.port.ts";

/**
 * Deterministic ClockPort for tests. Time only moves when the test advances it.
 */
export class VirtualClock implements ClockPort {
  private ms: number;

  constructor(startMs = 0) {
    this.ms = startMs;
  }

  now(): Date {
    return new Date(this.ms);
  }

  nowMs(): number {
    return this.ms;
  }

  /** Advance the clock by `delta` milliseconds. Must be non-negative. */
  advance(delta: number): void {
    if (delta < 0) {
      throw new Error(`VirtualClock.advance: negative delta ${delta}`);
    }
    this.ms += delta;
  }

  /** Jump to an absolute millisecond timestamp. */
  setNow(absMs: number): void {
    this.ms = absMs;
  }
}
