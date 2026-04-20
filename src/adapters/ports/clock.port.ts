/**
 * Abstracts wall-clock access so use cases can be unit-tested with a
 * VirtualClock. `nowMs()` is the primary API; `now()` is sugar over it.
 */
export interface ClockPort {
  now(): Date;
  nowMs(): number;
}
