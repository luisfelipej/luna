import { describe, expect, it } from "bun:test";
import { TelegramPresenter } from "../../../src/composition/telegram-presenter.ts";
import type { TelegramTransport } from "../../../src/adapters/ports/telegram-transport.port.ts";
import type { TelegramUpdate } from "../../../src/entities/telegram-update.ts";
import { FakeSessionStore } from "../../helpers/fakes/fake-session-store.ts";

// -- test doubles ----------------------------------------------------------

class InMemoryTransport implements TelegramTransport {
  readonly sent: Array<{ chatId: number; text: string }> = [];
  readonly edits: Array<{ chatId: number; messageId: number; text: string }> = [];
  private handler: ((u: TelegramUpdate) => Promise<void>) | null = null;
  async sendMessage(chatId: number, text: string): Promise<number> {
    this.sent.push({ chatId, text });
    return this.sent.length;
  }
  async editMessage(chatId: number, messageId: number, text: string): Promise<void> {
    this.edits.push({ chatId, messageId, text });
  }
  async sendFile(): Promise<void> {}
  onUpdate(handler: (u: TelegramUpdate) => Promise<void>): void {
    this.handler = handler;
  }
  async start(): Promise<void> {}
  async stop(): Promise<void> {}
  async deliver(u: TelegramUpdate): Promise<void> {
    if (!this.handler) throw new Error("no handler registered");
    await this.handler(u);
  }
}

class FakeAbortRegistry {
  readonly registered: number[] = [];
  readonly aborted: number[] = [];
  private ctrls = new Map<number, AbortController>();
  register(chatId: number): AbortController {
    this.registered.push(chatId);
    const c = new AbortController();
    this.ctrls.set(chatId, c);
    return c;
  }
  abort(chatId: number): boolean {
    const c = this.ctrls.get(chatId);
    if (!c) return false;
    c.abort();
    this.ctrls.delete(chatId);
    this.aborted.push(chatId);
    return true;
  }
  clear(chatId: number): void {
    this.ctrls.delete(chatId);
  }
  has(chatId: number): boolean {
    return this.ctrls.has(chatId);
  }
}

function update(chatId: number, text: string, fromId = chatId): TelegramUpdate {
  return { chatId, fromId, messageId: 1, text, dateMs: 1 };
}

// -- tests -----------------------------------------------------------------

describe("TelegramPresenter", () => {
  it("routes /new to resetSession", async () => {
    const transport = new InMemoryTransport();
    const aborts = new FakeAbortRegistry();
    const sessionStore = new FakeSessionStore();
    const resetCalls: number[] = [];
    const presenter = new TelegramPresenter({
      transport,
      aborts,
      sessionStore,
      resetSession: async (c) => {
        resetCalls.push(c);
      },
      stopStream: () => false,
      setModel: async () => {},
      setSetting: async () => {},
      resetSetting: async () => {},
      sendMessageToAgent: async () => {},
      resolver: { resolve: () => ({ value: "sonnet", tier: 6 }) },
      workspacePath: () => "/",
      webhookStatus: { snapshot: () => [] },
    });
    presenter.register();

    await transport.deliver(update(42, "/new"));

    expect(resetCalls).toEqual([42]);
    expect(transport.sent.at(-1)?.text.toLowerCase()).toContain("new session");
  });

  it("routes /stop through StopStream and reports whether a stream was running", async () => {
    const transport = new InMemoryTransport();
    const aborts = new FakeAbortRegistry();
    let stopRetval = true;
    const presenter = new TelegramPresenter({
      transport,
      aborts,
      sessionStore: new FakeSessionStore(),
      resetSession: async () => {},
      stopStream: (c) => {
        expect(c).toBe(42);
        return stopRetval;
      },
      setModel: async () => {},
      setSetting: async () => {},
      resetSetting: async () => {},
      sendMessageToAgent: async () => {},
      resolver: { resolve: () => ({ value: "sonnet", tier: 6 }) },
      workspacePath: () => "/",
      webhookStatus: { snapshot: () => [] },
    });
    presenter.register();

    await transport.deliver(update(42, "/stop"));
    expect(transport.sent.at(-1)?.text.toLowerCase()).toContain("stopped");

    stopRetval = false;
    transport.sent.length = 0;
    await transport.deliver(update(42, "/stop"));
    expect(transport.sent.at(-1)?.text.toLowerCase()).toContain("no active");
  });

  it("routes /model opus through setModel", async () => {
    const transport = new InMemoryTransport();
    const setCalls: Array<{ chatId: number; model: string }> = [];
    const presenter = new TelegramPresenter({
      transport,
      aborts: new FakeAbortRegistry(),
      sessionStore: new FakeSessionStore(),
      resetSession: async () => {},
      stopStream: () => false,
      setModel: async (c, m) => {
        setCalls.push({ chatId: c, model: m });
      },
      setSetting: async () => {},
      resetSetting: async () => {},
      sendMessageToAgent: async () => {},
      resolver: { resolve: () => ({ value: "sonnet", tier: 6 }) },
      workspacePath: () => "/",
      webhookStatus: { snapshot: () => [] },
    });
    presenter.register();

    await transport.deliver(update(42, "/model opus"));
    expect(setCalls).toEqual([{ chatId: 42, model: "opus" }]);
    expect(transport.sent.at(-1)?.text.toLowerCase()).toContain("opus");
  });

  it("/models lists models, /help lists help, /stats uses session store", async () => {
    const transport = new InMemoryTransport();
    const sessions = new FakeSessionStore();
    const presenter = new TelegramPresenter({
      transport,
      aborts: new FakeAbortRegistry(),
      sessionStore: sessions,
      resetSession: async () => {},
      stopStream: () => false,
      setModel: async () => {},
      setSetting: async () => {},
      resetSetting: async () => {},
      sendMessageToAgent: async () => {},
      resolver: { resolve: () => ({ value: "sonnet", tier: 6 }) },
      workspacePath: () => "/",
      webhookStatus: { snapshot: () => [{ name: "github", enabled: true, lastEventAtIso: null }] },
    });
    presenter.register();

    await transport.deliver(update(42, "/models"));
    expect(transport.sent.at(-1)?.text).toContain("opus");

    await transport.deliver(update(42, "/help"));
    expect(transport.sent.at(-1)?.text).toContain("/new");

    await transport.deliver(update(42, "/stats"));
    expect(transport.sent.at(-1)?.text.toLowerCase()).toContain("no active session");

    await transport.deliver(update(42, "/webhooks"));
    expect(transport.sent.at(-1)?.text).toContain("github");
  });

  it("/workspace* and /job* reply with 'not yet implemented'", async () => {
    const transport = new InMemoryTransport();
    const presenter = new TelegramPresenter({
      transport,
      aborts: new FakeAbortRegistry(),
      sessionStore: new FakeSessionStore(),
      resetSession: async () => {},
      stopStream: () => false,
      setModel: async () => {},
      setSetting: async () => {},
      resetSetting: async () => {},
      sendMessageToAgent: async () => {},
      resolver: { resolve: () => ({ value: "sonnet", tier: 6 }) },
      workspacePath: () => "/",
      webhookStatus: { snapshot: () => [] },
    });
    presenter.register();

    await transport.deliver(update(42, "/workspace"));
    expect(transport.sent.at(-1)?.text.toLowerCase()).toContain("not yet implemented");

    await transport.deliver(update(42, "/jobs-info"));
    expect(transport.sent.at(-1)?.text.toLowerCase()).toContain("not yet implemented");
  });

  it("unknown command replies politely", async () => {
    const transport = new InMemoryTransport();
    const presenter = new TelegramPresenter({
      transport,
      aborts: new FakeAbortRegistry(),
      sessionStore: new FakeSessionStore(),
      resetSession: async () => {},
      stopStream: () => false,
      setModel: async () => {},
      setSetting: async () => {},
      resetSetting: async () => {},
      sendMessageToAgent: async () => {},
      resolver: { resolve: () => ({ value: "sonnet", tier: 6 }) },
      workspacePath: () => "/",
      webhookStatus: { snapshot: () => [] },
    });
    presenter.register();

    await transport.deliver(update(42, "/teleport"));
    expect(transport.sent.at(-1)?.text.toLowerCase()).toContain("unknown command");
  });

  it("free-text calls sendMessageToAgent and registers an AbortController", async () => {
    const transport = new InMemoryTransport();
    const aborts = new FakeAbortRegistry();
    const agentCalls: Array<{ chatId: number; text: string; hasSignal: boolean }> = [];
    const presenter = new TelegramPresenter({
      transport,
      aborts,
      sessionStore: new FakeSessionStore(),
      resetSession: async () => {},
      stopStream: () => false,
      setModel: async () => {},
      setSetting: async () => {},
      resetSetting: async () => {},
      sendMessageToAgent: async (call) => {
        agentCalls.push({
          chatId: call.chatId,
          text: call.text,
          hasSignal: call.signal !== undefined,
        });
      },
      resolver: { resolve: () => ({ value: "sonnet", tier: 6 }) },
      workspacePath: () => "/",
      webhookStatus: { snapshot: () => [] },
    });
    presenter.register();

    await transport.deliver(update(42, "hello world"));

    expect(agentCalls).toEqual([{ chatId: 42, text: "hello world", hasSignal: true }]);
    expect(aborts.registered).toEqual([42]);
  });

  it("/jobs lists only the chat's jobs", async () => {
    const { FakeJobStore } = await import("../../helpers/fakes/fake-job-store.ts");
    const transport = new InMemoryTransport();
    const jobStore = new FakeJobStore();
    await jobStore.insert({
      chatId: 42,
      name: "daily digest",
      jobType: "agent",
      prompt: "digest",
      schedule: { kind: "daily", timesUtc: ["09:00"] },
      active: true,
      autoRemove: false,
      createdAt: new Date(),
    });
    await jobStore.insert({
      chatId: 99,
      name: "not mine",
      jobType: "reminder",
      prompt: "x",
      schedule: { kind: "once", atIso: "2030-01-01T00:00:00Z" },
      active: true,
      autoRemove: false,
      createdAt: new Date(),
    });
    const presenter = new TelegramPresenter({
      transport,
      aborts: new FakeAbortRegistry(),
      sessionStore: new FakeSessionStore(),
      resetSession: async () => {},
      stopStream: () => false,
      setModel: async () => {},
      setSetting: async () => {},
      resetSetting: async () => {},
      sendMessageToAgent: async () => {},
      resolver: { resolve: () => ({ value: "sonnet", tier: 6 }) },
      workspacePath: () => "/",
      webhookStatus: { snapshot: () => [] },
      jobStore,
      cancelJob: async () => false,
    });
    presenter.register();

    await transport.deliver(update(42, "/jobs"));
    const body = transport.sent.at(-1)?.text ?? "";
    expect(body).toContain("daily digest");
    expect(body).not.toContain("not mine");
  });

  it("/job <id> shows details only for the calling chat", async () => {
    const { FakeJobStore } = await import("../../helpers/fakes/fake-job-store.ts");
    const transport = new InMemoryTransport();
    const jobStore = new FakeJobStore();
    await jobStore.insert({
      chatId: 42,
      name: "j",
      jobType: "reminder",
      prompt: "wake up",
      schedule: { kind: "once", atIso: "2030-01-01T00:00:00Z" },
      active: true,
      autoRemove: false,
      createdAt: new Date(),
    });
    const presenter = new TelegramPresenter({
      transport,
      aborts: new FakeAbortRegistry(),
      sessionStore: new FakeSessionStore(),
      resetSession: async () => {},
      stopStream: () => false,
      setModel: async () => {},
      setSetting: async () => {},
      resetSetting: async () => {},
      sendMessageToAgent: async () => {},
      resolver: { resolve: () => ({ value: "sonnet", tier: 6 }) },
      workspacePath: () => "/",
      webhookStatus: { snapshot: () => [] },
      jobStore,
      cancelJob: async () => false,
    });
    presenter.register();

    await transport.deliver(update(42, "/job 1"));
    expect(transport.sent.at(-1)?.text).toContain("wake up");

    // another chat cannot peek
    await transport.deliver(update(99, "/job 1"));
    expect(transport.sent.at(-1)?.text).toContain("not found");
  });

  it("/job cancel <id> invokes cancelJob and replies", async () => {
    const { FakeJobStore } = await import("../../helpers/fakes/fake-job-store.ts");
    const transport = new InMemoryTransport();
    const jobStore = new FakeJobStore();
    const id = await jobStore.insert({
      chatId: 42,
      name: "j",
      jobType: "reminder",
      prompt: "x",
      schedule: { kind: "once", atIso: "2030-01-01T00:00:00Z" },
      active: true,
      autoRemove: false,
      createdAt: new Date(),
    });
    const cancelled: number[] = [];
    const presenter = new TelegramPresenter({
      transport,
      aborts: new FakeAbortRegistry(),
      sessionStore: new FakeSessionStore(),
      resetSession: async () => {},
      stopStream: () => false,
      setModel: async () => {},
      setSetting: async () => {},
      resetSetting: async () => {},
      sendMessageToAgent: async () => {},
      resolver: { resolve: () => ({ value: "sonnet", tier: 6 }) },
      workspacePath: () => "/",
      webhookStatus: { snapshot: () => [] },
      jobStore,
      cancelJob: async (jid) => {
        cancelled.push(jid);
        await jobStore.delete(jid);
        return true;
      },
    });
    presenter.register();

    await transport.deliver(update(42, `/job cancel ${id}`));
    expect(cancelled).toEqual([id]);
    expect(transport.sent.at(-1)?.text).toContain(`Job ${id} cancelled`);
  });
});
