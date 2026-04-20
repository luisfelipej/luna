import { describe, expect, it } from "bun:test";
import { makeRestoreOnStart } from "../../../src/usecases/restore-on-start.ts";

function fakeTransport() {
  const sent: Array<{ chatId: number; text: string }> = [];
  return {
    sent,
    async sendMessage(chatId: number, text: string) {
      sent.push({ chatId, text });
      return sent.length;
    },
    async editMessage() {},
    async sendFile() {},
    onUpdate() {},
    async start() {},
    async stop() {},
  };
}

function fakeCrashRecovery(initial: readonly number[]) {
  const pending = new Set<number>(initial);
  const cleared: number[] = [];
  return {
    pending,
    cleared,
    async mark(chatId: number) {
      pending.add(chatId);
    },
    async clear(chatId: number) {
      pending.delete(chatId);
      cleared.push(chatId);
    },
    async listPending() {
      return [...pending].sort((a, b) => a - b);
    },
  };
}

describe("makeRestoreOnStart", () => {
  it("notifies every pending chat and clears each flag", async () => {
    const transport = fakeTransport();
    const crash = fakeCrashRecovery([11, 22]);
    const restore = makeRestoreOnStart({ transport, crashRecovery: crash });

    await restore();

    expect(transport.sent).toHaveLength(2);
    expect(transport.sent[0]!.chatId).toBe(11);
    expect(transport.sent[1]!.chatId).toBe(22);
    for (const s of transport.sent) {
      expect(s.text).toMatch(/interrupted/i);
    }
    expect(crash.cleared.sort()).toEqual([11, 22]);
  });

  it("is a no-op when there are no pending flags", async () => {
    const transport = fakeTransport();
    const crash = fakeCrashRecovery([]);
    const restore = makeRestoreOnStart({ transport, crashRecovery: crash });
    await restore();
    expect(transport.sent).toEqual([]);
    expect(crash.cleared).toEqual([]);
  });

  it("invokes the optional scheduler rehydrate hook (safe no-op if unbound)", async () => {
    const transport = fakeTransport();
    const crash = fakeCrashRecovery([]);
    let called = 0;
    const restore = makeRestoreOnStart({
      transport,
      crashRecovery: crash,
      rehydrateScheduler: async () => {
        called++;
      },
    });
    await restore();
    expect(called).toBe(1);
  });

  it("continues notifying remaining chats even if one send fails", async () => {
    const transport = {
      ...fakeTransport(),
      async sendMessage(chatId: number) {
        if (chatId === 11) throw new Error("boom");
        return 1;
      },
    };
    const crash = fakeCrashRecovery([11, 22]);
    const loggerMsgs: string[] = [];
    const restore = makeRestoreOnStart({
      transport,
      crashRecovery: crash,
      logger: {
        debug() {},
        info() {},
        warn(m: string) {
          loggerMsgs.push(m);
        },
        error(m: string) {
          loggerMsgs.push(m);
        },
        child() {
          return this;
        },
      },
    });
    await restore();
    // chat 22 was notified + cleared; chat 11 was not cleared since send failed
    expect(crash.cleared).toEqual([22]);
    expect(loggerMsgs.some((m) => m.toLowerCase().includes("failed"))).toBe(true);
  });
});
