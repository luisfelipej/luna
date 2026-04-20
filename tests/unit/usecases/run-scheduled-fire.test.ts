import { beforeEach, describe, expect, it } from "bun:test";
import { makeRunScheduledFire } from "../../../src/usecases/scheduler/run-scheduled-fire.ts";
import { FakeJobStore } from "../../helpers/fakes/fake-job-store.ts";
import { FakeTelegramTransport } from "../../helpers/fakes/fake-telegram-transport.ts";
import { VirtualClock } from "../../helpers/virtual-clock.ts";

const T0 = Date.parse("2026-04-20T12:00:00Z");

describe("RunScheduledFire", () => {
  let jobStore: FakeJobStore;
  let transport: FakeTelegramTransport;
  let clock: VirtualClock;

  beforeEach(() => {
    jobStore = new FakeJobStore();
    transport = new FakeTelegramTransport();
    clock = new VirtualClock(T0);
  });

  it("reminder branch: sendMessage with prompt verbatim + stamp firedAt for once", async () => {
    const id = await jobStore.insert({
      chatId: 42,
      name: "take meds",
      jobType: "reminder",
      prompt: "take meds",
      schedule: { kind: "once", atIso: new Date(T0).toISOString() },
      active: true,
      autoRemove: false,
      createdAt: new Date(T0),
    });
    const unregistered: number[] = [];
    const run = makeRunScheduledFire({
      jobStore,
      transport,
      sendMessageToAgent: async () => {
        throw new Error("should not be called");
      },
      scheduler: { register: async () => {}, unregister: async (x) => void unregistered.push(x) },
      clock,
    });

    await run(id);

    expect(transport.sent).toEqual([{ chatId: 42, text: "take meds" }]);
    const row = await jobStore.get(id);
    expect(row?.firedAt).toBeInstanceOf(Date);
    // once jobs get unregistered after firing
    expect(unregistered).toEqual([id]);
  });

  it("agent branch: delegates to SendMessageToAgent with prompt", async () => {
    const id = await jobStore.insert({
      chatId: 42,
      name: "digest",
      jobType: "agent",
      prompt: "summarize today",
      schedule: { kind: "interval", seconds: 3600 },
      active: true,
      autoRemove: false,
      createdAt: new Date(T0),
    });

    const agentCalls: Array<{ chatId: number; text: string }> = [];
    const run = makeRunScheduledFire({
      jobStore,
      transport,
      sendMessageToAgent: async (call) => {
        agentCalls.push({ chatId: call.chatId, text: call.text });
        return { text: "done" };
      },
      scheduler: { register: async () => {}, unregister: async () => {} },
      clock,
    });

    await run(id);
    expect(agentCalls).toEqual([{ chatId: 42, text: "summarize today" }]);
    // interval job is NOT stamp-fired (firedAt only for once)
    const row = await jobStore.get(id);
    expect(row?.firedAt).toBeNull();
  });

  it("CONDITION_MET in agent response with auto_remove → delete + unregister + notify", async () => {
    const id = await jobStore.insert({
      chatId: 99,
      name: "watcher",
      jobType: "agent",
      prompt: "check deploy",
      schedule: { kind: "interval", seconds: 60 },
      active: true,
      autoRemove: true,
      createdAt: new Date(T0),
    });
    const unregistered: number[] = [];
    const run = makeRunScheduledFire({
      jobStore,
      transport,
      sendMessageToAgent: async () => ({ text: "all green — CONDITION_MET" }),
      scheduler: { register: async () => {}, unregister: async (x) => void unregistered.push(x) },
      clock,
    });

    await run(id);
    expect(await jobStore.get(id)).toBeNull();
    expect(unregistered).toEqual([id]);
    expect(transport.sent.at(-1)?.text).toContain("removed (condition met)");
  });

  it("CONDITION_NOT_MET leaves job active", async () => {
    const id = await jobStore.insert({
      chatId: 1,
      name: "w",
      jobType: "agent",
      prompt: "check",
      schedule: { kind: "interval", seconds: 60 },
      active: true,
      autoRemove: true,
      createdAt: new Date(T0),
    });
    const run = makeRunScheduledFire({
      jobStore,
      transport,
      sendMessageToAgent: async () => ({ text: "still waiting — CONDITION_NOT_MET" }),
      scheduler: { register: async () => {}, unregister: async () => {} },
      clock,
    });
    await run(id);
    const row = await jobStore.get(id);
    expect(row).not.toBeNull();
    expect(row?.active).toBe(true);
  });

  it("no marker with auto_remove leaves the job active (neither sentinel present)", async () => {
    const id = await jobStore.insert({
      chatId: 1,
      name: "w",
      jobType: "agent",
      prompt: "check",
      schedule: { kind: "interval", seconds: 60 },
      active: true,
      autoRemove: true,
      createdAt: new Date(T0),
    });
    const run = makeRunScheduledFire({
      jobStore,
      transport,
      sendMessageToAgent: async () => ({ text: "nothing notable" }),
      scheduler: { register: async () => {}, unregister: async () => {} },
      clock,
    });
    await run(id);
    expect(await jobStore.get(id)).not.toBeNull();
  });

  it("deleted job (race) is a no-op", async () => {
    const run = makeRunScheduledFire({
      jobStore,
      transport,
      sendMessageToAgent: async () => ({ text: "x" }),
      scheduler: { register: async () => {}, unregister: async () => {} },
      clock,
    });
    await run(9999); // doesn't exist
    expect(transport.sent).toEqual([]);
  });
});
