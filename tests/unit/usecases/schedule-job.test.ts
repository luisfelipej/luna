import { describe, expect, it } from "bun:test";
import { makeScheduleJob } from "../../../src/usecases/http/schedule-job.ts";
import { FakeJobStore } from "../../helpers/fakes/fake-job-store.ts";

describe("ScheduleJob (Phase 7 stub — persists only)", () => {
  it("persists a `once` job and returns the assigned id", async () => {
    const store = new FakeJobStore();
    const schedule = makeScheduleJob({ jobStore: store });
    const { id, accepted } = await schedule({
      chatId: 42,
      name: "cleanup",
      jobType: "reminder",
      prompt: "do it",
      schedule: { kind: "once", atIso: "2030-01-01T00:00:00Z" },
    });
    expect(id).toBeGreaterThan(0);
    expect(accepted).toBe(true);
    const rows = await store.list(42);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.name).toBe("cleanup");
    expect(rows[0]?.active).toBe(true);
  });

  it("rejects an invalid schedule kind", async () => {
    const store = new FakeJobStore();
    const schedule = makeScheduleJob({ jobStore: store });
    await expect(
      schedule({
        chatId: 42,
        name: "bad",
        jobType: "reminder",
        prompt: "x",
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        schedule: { kind: "quarterly" } as any,
      }),
    ).rejects.toThrow();
  });
});
