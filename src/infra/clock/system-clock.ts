import type { ClockPort } from "../../adapters/ports/clock.port.ts";

/**
 * Wall-clock implementation of ClockPort. Delegates to `Date.now()`.
 */
export class SystemClock implements ClockPort {
  now(): Date {
    return new Date();
  }
  nowMs(): number {
    return Date.now();
  }
}
