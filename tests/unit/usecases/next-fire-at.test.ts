import { describe, expect, it } from "bun:test";
import type { Schedule } from "../../../src/entities/job.ts";
import { nextFireAt } from "../../../src/usecases/scheduler/next-fire-at.ts";

// Use a fixed reference moment for readability.
const T = (iso: string): number => Date.parse(iso);

describe("nextFireAt — once", () => {
  it("future once-job returns its atIso", () => {
    const s: Schedule = { kind: "once", atIso: "2026-05-01T12:00:00Z" };
    expect(nextFireAt(s, T("2026-04-20T12:00:00Z"))).toBe(T("2026-05-01T12:00:00Z"));
  });

  it("past once-job returns now (catch-up marker)", () => {
    const s: Schedule = { kind: "once", atIso: "2026-01-01T00:00:00Z" };
    const now = T("2026-04-20T12:00:00Z");
    expect(nextFireAt(s, now)).toBe(now);
  });

  it("present instant counts as 'now'", () => {
    const s: Schedule = { kind: "once", atIso: "2026-04-20T12:00:00Z" };
    const now = T("2026-04-20T12:00:00Z");
    expect(nextFireAt(s, now)).toBe(now);
  });
});

describe("nextFireAt — interval", () => {
  it("no firstRun → first slot is now", () => {
    const s: Schedule = { kind: "interval", seconds: 300 };
    const now = T("2026-04-20T12:00:00Z");
    expect(nextFireAt(s, now)).toBe(now);
  });

  it("firstRun in future → returns firstRun", () => {
    const s: Schedule = {
      kind: "interval",
      seconds: 300,
      firstRunIso: "2026-04-20T13:00:00Z",
    };
    const now = T("2026-04-20T12:00:00Z");
    expect(nextFireAt(s, now)).toBe(T("2026-04-20T13:00:00Z"));
  });

  it("firstRun in past → skip forward by whole intervals", () => {
    // first run 2026-04-20T12:00:00Z, every 300s, now = 12:07:01Z
    // 12:00 + 300s*2 = 12:10 ≥ now
    const s: Schedule = {
      kind: "interval",
      seconds: 300,
      firstRunIso: "2026-04-20T12:00:00Z",
    };
    const now = T("2026-04-20T12:07:01Z");
    expect(nextFireAt(s, now)).toBe(T("2026-04-20T12:10:00Z"));
  });

  it("firstRun exactly at now returns now", () => {
    const s: Schedule = {
      kind: "interval",
      seconds: 300,
      firstRunIso: "2026-04-20T12:00:00Z",
    };
    const now = T("2026-04-20T12:00:00Z");
    expect(nextFireAt(s, now)).toBe(now);
  });
});

describe("nextFireAt — daily multi-slot UTC", () => {
  it("earliest remaining slot today", () => {
    const s: Schedule = { kind: "daily", timesUtc: ["08:00", "20:00"] };
    const now = T("2026-04-20T12:00:00Z");
    expect(nextFireAt(s, now)).toBe(T("2026-04-20T20:00:00Z"));
  });

  it("no slots remain today → first slot tomorrow", () => {
    const s: Schedule = { kind: "daily", timesUtc: ["08:00", "20:00"] };
    const now = T("2026-04-20T22:00:00Z");
    expect(nextFireAt(s, now)).toBe(T("2026-04-21T08:00:00Z"));
  });

  it("slot equal to now returns now", () => {
    const s: Schedule = { kind: "daily", timesUtc: ["08:00", "20:00"] };
    const now = T("2026-04-20T20:00:00Z");
    expect(nextFireAt(s, now)).toBe(now);
  });

  it("single slot, already past today → tomorrow's slot", () => {
    const s: Schedule = { kind: "daily", timesUtc: ["09:30"] };
    const now = T("2026-04-20T10:00:00Z");
    expect(nextFireAt(s, now)).toBe(T("2026-04-21T09:30:00Z"));
  });

  it("slots in unsorted order are still handled correctly", () => {
    const s: Schedule = { kind: "daily", timesUtc: ["20:00", "08:00"] };
    const now = T("2026-04-20T00:00:00Z");
    expect(nextFireAt(s, now)).toBe(T("2026-04-20T08:00:00Z"));
  });

  it("empty times array throws", () => {
    const s: Schedule = { kind: "daily", timesUtc: [] };
    expect(() => nextFireAt(s, T("2026-04-20T00:00:00Z"))).toThrow();
  });

  it("invalid HH:MM string throws", () => {
    const s: Schedule = { kind: "daily", timesUtc: ["08:00", "25:99"] };
    expect(() => nextFireAt(s, T("2026-04-20T00:00:00Z"))).toThrow();
  });
});
