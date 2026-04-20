import { beforeEach, describe, expect, it } from "bun:test";
import type { JobRow, NewJob } from "../../../src/adapters/ports/job-store.port.ts";
import { LoopScheduler } from "../../../src/composition/scheduler/loop-scheduler.ts";
import { FakeJobStore } from "../../helpers/fakes/fake-job-store.ts";
import { FakeTimers } from "../../helpers/fake-timers.ts";
import { VirtualClock } from "../../helpers/virtual-clock.ts";

// Fixed anchor: 2026-04-20T12:00:00Z ms.
const T0 = Date.parse("2026-04-20T12:00:00Z");

function buildJob(overrides: Partial<NewJob> & { id?: number }): JobRow {
  const createdAt = new Date(T0);
  return {
    id: overrides.id ?? 1,
    chatId: overrides.chatId ?? 42,
    name: overrides.name ?? "job",
    jobType: overrides.jobType ?? "reminder",
    prompt: overrides.prompt ?? "ping",
    schedule: overrides.schedule ?? {
      kind: "once",
      atIso: new Date(T0 + 60_000).toISOString(),
    },
    active: overrides.active ?? true,
    autoRemove: overrides.autoRemove ?? false,
    firedAt: null,
    createdAt,
  };
}

describe("LoopScheduler", () => {
  let clock: VirtualClock;
  let timers: FakeTimers;
  let jobStore: FakeJobStore;

  beforeEach(() => {
    clock = new VirtualClock(T0);
    timers = new FakeTimers(clock);
    jobStore = new FakeJobStore();
  });

  it("fires a registered once-job at its scheduled time", async () => {
    const fired: number[] = [];
    const scheduler = new LoopScheduler({
      jobStore,
      clock,
      setTimeout: timers.setTimeout,
      clearTimeout: timers.clearTimeout,
    });
    await scheduler.start(async (jobId) => {
      fired.push(jobId);
    });

    const id = await jobStore.insert({
      chatId: 42,
      name: "t",
      jobType: "reminder",
      prompt: "p",
      schedule: { kind: "once", atIso: new Date(T0 + 60_000).toISOString() },
      active: true,
      autoRemove: false,
      createdAt: new Date(T0),
    });
    const row = await jobStore.get(id);
    if (!row) throw new Error("missing row");
    await scheduler.register(row);

    // Before deadline
    await timers.advance(59_000);
    expect(fired).toEqual([]);
    // At deadline
    await timers.advance(1_000);
    expect(fired).toEqual([id]);
    await scheduler.stop();
  });

  it("wakes on the earliest of multiple pending jobs", async () => {
    const fired: number[] = [];
    const scheduler = new LoopScheduler({
      jobStore,
      clock,
      setTimeout: timers.setTimeout,
      clearTimeout: timers.clearTimeout,
    });
    await scheduler.start(async (jobId) => {
      fired.push(jobId);
    });

    const later = buildJob({
      id: 1,
      schedule: { kind: "once", atIso: new Date(T0 + 120_000).toISOString() },
    });
    const earlier = buildJob({
      id: 2,
      schedule: { kind: "once", atIso: new Date(T0 + 30_000).toISOString() },
    });
    await jobStore.insert(later);
    await jobStore.insert(earlier);
    await scheduler.register(await force(jobStore.get(1)));
    await scheduler.register(await force(jobStore.get(2)));

    await timers.advance(30_000);
    expect(fired).toEqual([2]);
    await timers.advance(90_000);
    expect(fired).toEqual([2, 1]);
    await scheduler.stop();
  });

  it("unregister cancels a job before its fire", async () => {
    const fired: number[] = [];
    const scheduler = new LoopScheduler({
      jobStore,
      clock,
      setTimeout: timers.setTimeout,
      clearTimeout: timers.clearTimeout,
    });
    await scheduler.start(async (id) => {
      fired.push(id);
    });

    const id = await jobStore.insert({
      chatId: 1,
      name: "c",
      jobType: "reminder",
      prompt: "p",
      schedule: { kind: "once", atIso: new Date(T0 + 60_000).toISOString() },
      active: true,
      autoRemove: false,
      createdAt: new Date(T0),
    });
    await scheduler.register(await force(jobStore.get(id)));
    await scheduler.unregister(id);

    await timers.advance(120_000);
    expect(fired).toEqual([]);
    await scheduler.stop();
  });

  it("catch-up: past-due once jobs fire immediately on start", async () => {
    // schedule a past-due once job (already 5 min past anchor)
    await jobStore.insert({
      chatId: 42,
      name: "late",
      jobType: "reminder",
      prompt: "p",
      schedule: { kind: "once", atIso: new Date(T0 - 300_000).toISOString() },
      active: true,
      autoRemove: false,
      createdAt: new Date(T0 - 400_000),
    });
    const fired: number[] = [];
    const scheduler = new LoopScheduler({
      jobStore,
      clock,
      setTimeout: timers.setTimeout,
      clearTimeout: timers.clearTimeout,
    });
    await scheduler.start(async (id) => {
      fired.push(id);
    });

    // Catch-up is invoked via a 0-delay timer at start; flush it.
    await timers.advance(0);
    expect(fired).toEqual([1]);
    await scheduler.stop();
  });

  it("catch-up: daily/interval jobs are NOT caught up — only next slot is scheduled", async () => {
    // daily 08:00 & 20:00 ; anchor is 12:00 → missed 08:00 today must NOT fire
    await jobStore.insert({
      chatId: 42,
      name: "d",
      jobType: "reminder",
      prompt: "p",
      schedule: { kind: "daily", timesUtc: ["08:00", "20:00"] },
      active: true,
      autoRemove: false,
      createdAt: new Date(T0 - 3_600_000),
    });
    const fired: number[] = [];
    const scheduler = new LoopScheduler({
      jobStore,
      clock,
      setTimeout: timers.setTimeout,
      clearTimeout: timers.clearTimeout,
    });
    await scheduler.start(async (id) => {
      fired.push(id);
    });

    await timers.advance(0);
    expect(fired).toEqual([]);
    // Next slot is 20:00 → advance 8h
    await timers.advance(8 * 3600 * 1000);
    expect(fired).toEqual([1]);
    await scheduler.stop();
  });

  it("stop() clears pending timer", async () => {
    const scheduler = new LoopScheduler({
      jobStore,
      clock,
      setTimeout: timers.setTimeout,
      clearTimeout: timers.clearTimeout,
    });
    await scheduler.start(async () => {});
    const id = await jobStore.insert({
      chatId: 1,
      name: "x",
      jobType: "reminder",
      prompt: "p",
      schedule: { kind: "once", atIso: new Date(T0 + 60_000).toISOString() },
      active: true,
      autoRemove: false,
      createdAt: new Date(T0),
    });
    await scheduler.register(await force(jobStore.get(id)));
    expect(timers.pendingCount).toBeGreaterThan(0);
    await scheduler.stop();
    expect(timers.pendingCount).toBe(0);
  });
});

async function force<T>(p: Promise<T | null>): Promise<T> {
  const v = await p;
  if (v === null) throw new Error("expected non-null");
  return v;
}
