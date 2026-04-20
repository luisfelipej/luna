import { describe, expect, test } from "bun:test";
import type { JobStore, NewJob } from "../../src/adapters/ports/job-store.port.ts";
import type { Schedule } from "../../src/entities/job.ts";

function sampleJob(chatId: number, schedule: Schedule, over: Partial<NewJob> = {}): NewJob {
  return {
    chatId,
    name: over.name ?? "daily-report",
    jobType: over.jobType ?? "reminder",
    prompt: over.prompt ?? "hi",
    schedule,
    active: over.active ?? true,
    autoRemove: over.autoRemove ?? false,
    createdAt: over.createdAt ?? new Date("2025-01-01T00:00:00Z"),
  };
}

export function jobStoreContract(
  name: string,
  makeStore: () => Promise<JobStore> | JobStore,
): void {
  describe(`JobStore contract [${name}]`, () => {
    test("insert + list filters by chatId", async () => {
      const s = await makeStore();
      await s.insert(sampleJob(1, { kind: "once", atIso: "2025-01-02T00:00:00Z" }));
      await s.insert(sampleJob(2, { kind: "interval", seconds: 60 }));
      const forOne = await s.list(1);
      expect(forOne).toHaveLength(1);
      expect(forOne[0]?.chatId).toBe(1);
    });

    test("schedule roundtrips for every kind", async () => {
      const s = await makeStore();
      const onceId = await s.insert(sampleJob(10, { kind: "once", atIso: "2025-05-01T00:00:00Z" }));
      const intId = await s.insert(sampleJob(10, { kind: "interval", seconds: 30 }));
      const dailyId = await s.insert(
        sampleJob(10, { kind: "daily", timesUtc: ["09:00", "18:00"] }),
      );
      const once = await s.get(onceId);
      const int = await s.get(intId);
      const daily = await s.get(dailyId);
      expect(once?.schedule.kind).toBe("once");
      if (once?.schedule.kind === "once") expect(once.schedule.atIso).toBe("2025-05-01T00:00:00Z");
      expect(int?.schedule.kind).toBe("interval");
      if (int?.schedule.kind === "interval") expect(int.schedule.seconds).toBe(30);
      expect(daily?.schedule.kind).toBe("daily");
      if (daily?.schedule.kind === "daily")
        expect(daily.schedule.timesUtc).toEqual(["09:00", "18:00"]);
    });

    test("allActive excludes paused", async () => {
      const s = await makeStore();
      const aId = await s.insert(sampleJob(11, { kind: "interval", seconds: 60 }));
      const bId = await s.insert(sampleJob(11, { kind: "interval", seconds: 60 }));
      await s.update(bId, { active: false });
      const active = await s.allActive();
      const ids = active.map((r) => r.id);
      expect(ids).toContain(aId);
      expect(ids).not.toContain(bId);
    });

    test("stampFired persists", async () => {
      const s = await makeStore();
      const id = await s.insert(sampleJob(12, { kind: "once", atIso: "2025-05-01T00:00:00Z" }));
      const at = new Date("2025-05-02T00:00:00Z");
      await s.stampFired(id, at);
      const row = await s.get(id);
      expect(row?.firedAt?.toISOString()).toBe(at.toISOString());
    });

    test("delete removes the row", async () => {
      const s = await makeStore();
      const id = await s.insert(sampleJob(13, { kind: "interval", seconds: 60 }));
      await s.delete(id);
      expect(await s.get(id)).toBeNull();
    });
  });
}
