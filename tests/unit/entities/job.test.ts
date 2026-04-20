import { describe, expect, it } from "bun:test";
import type { Job, Schedule } from "../../../src/entities/job.ts";

describe("Job + Schedule ADT", () => {
  it("exhaustive switch over Schedule.kind", () => {
    const schedules: Schedule[] = [
      { kind: "once", atIso: "2030-01-01T00:00:00Z" },
      { kind: "interval", seconds: 60 },
      { kind: "daily", timesUtc: ["09:00", "18:00"] },
    ];
    for (const s of schedules) {
      const tag: string = ((): string => {
        switch (s.kind) {
          case "once":
            return `once@${s.atIso}`;
          case "interval":
            return `every ${s.seconds}s`;
          case "daily":
            return `daily ${s.timesUtc.join(",")}`;
        }
      })();
      expect(tag.length).toBeGreaterThan(0);
    }
  });

  it("constructs a minimal agent Job", () => {
    const job: Job = {
      id: 1,
      chatId: 42,
      name: "morning-brief",
      jobType: "agent",
      prompt: "Summarize yesterday",
      schedule: { kind: "daily", timesUtc: ["08:00"] },
      active: true,
      autoRemove: false,
      firedAt: null,
      createdAt: new Date(0),
    };
    expect(job.jobType).toBe("agent");
  });
});
