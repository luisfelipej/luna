import type { Schedule } from "../../entities/job.ts";

/**
 * Pure function: given a `Schedule` and the current time (ms since epoch),
 * compute the next fire time as ms since epoch.
 *
 * Semantics (from spec #45):
 *   - `once`: returns the ISO instant; if already past, returns `now` (marker
 *     used by the scheduler to fire-and-stamp immediately).
 *   - `interval`: if `firstRunIso` is unset, first fire is `now`. If the
 *     `firstRunIso` lies in the past, jump forward by whole intervals until
 *     we reach a time ≥ now.
 *   - `daily`: earliest HH:MM UTC slot ≥ now today; otherwise earliest slot
 *     tomorrow. Empty or malformed slot list throws.
 *
 * Invariant: never returns a value strictly less than `nowMs`.
 */
export function nextFireAt(schedule: Schedule, nowMs: number): number {
  switch (schedule.kind) {
    case "once": {
      const at = Date.parse(schedule.atIso);
      if (Number.isNaN(at)) {
        throw new Error(`nextFireAt: invalid once.atIso: ${schedule.atIso}`);
      }
      return at < nowMs ? nowMs : at;
    }
    case "interval": {
      const step = schedule.seconds * 1000;
      if (!(step > 0)) {
        throw new Error(`nextFireAt: interval.seconds must be > 0, got ${schedule.seconds}`);
      }
      if (schedule.firstRunIso === undefined) {
        return nowMs;
      }
      const first = Date.parse(schedule.firstRunIso);
      if (Number.isNaN(first)) {
        throw new Error(`nextFireAt: invalid interval.firstRunIso: ${schedule.firstRunIso}`);
      }
      if (first >= nowMs) return first;
      const delta = nowMs - first;
      const jumps = Math.ceil(delta / step);
      return first + jumps * step;
    }
    case "daily": {
      if (schedule.timesUtc.length === 0) {
        throw new Error("nextFireAt: daily.timesUtc must be non-empty");
      }
      const slots = schedule.timesUtc.map(parseHhMm).sort((a, b) => a.h - b.h || a.m - b.m);
      const now = new Date(nowMs);
      const year = now.getUTCFullYear();
      const month = now.getUTCMonth();
      const day = now.getUTCDate();
      for (const s of slots) {
        const at = Date.UTC(year, month, day, s.h, s.m, 0, 0);
        if (at >= nowMs) return at;
      }
      // all slots today are past → first slot tomorrow
      const first = slots[0];
      if (!first) {
        throw new Error("nextFireAt: daily.timesUtc parsed to empty set");
      }
      return Date.UTC(year, month, day + 1, first.h, first.m, 0, 0);
    }
  }
}

interface HhMm {
  readonly h: number;
  readonly m: number;
}

function parseHhMm(raw: string): HhMm {
  const match = /^(\d{2}):(\d{2})$/.exec(raw);
  if (!match) throw new Error(`nextFireAt: invalid HH:MM slot '${raw}'`);
  const h = Number(match[1]);
  const m = Number(match[2]);
  if (h < 0 || h > 23 || m < 0 || m > 59) {
    throw new Error(`nextFireAt: out-of-range HH:MM slot '${raw}'`);
  }
  return { h, m };
}
