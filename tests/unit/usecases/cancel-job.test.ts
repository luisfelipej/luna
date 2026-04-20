import { describe, expect, it } from "bun:test";
import { makeCancelJob } from "../../../src/usecases/scheduler/cancel-job.ts";
import { FakeJobStore } from "../../helpers/fakes/fake-job-store.ts";

describe("CancelJob", () => {
  it("deletes the row and unregisters from the scheduler", async () => {
    const store = new FakeJobStore();
    const unregistered: number[] = [];
    const id = await store.insert({
      chatId: 1,
      name: "c",
      jobType: "reminder",
      prompt: "p",
      schedule: { kind: "once", atIso: "2030-01-01T00:00:00Z" },
      active: true,
      autoRemove: false,
      createdAt: new Date(),
    });

    const cancel = makeCancelJob({
      jobStore: store,
      scheduler: {
        register: async () => {},
        unregister: async (jid) => void unregistered.push(jid),
      },
    });
    const removed = await cancel(id);
    expect(removed).toBe(true);
    expect(await store.get(id)).toBeNull();
    expect(unregistered).toEqual([id]);
  });

  it("returns false when job does not exist", async () => {
    const store = new FakeJobStore();
    const cancel = makeCancelJob({
      jobStore: store,
      scheduler: { register: async () => {}, unregister: async () => {} },
    });
    expect(await cancel(999)).toBe(false);
  });
});
