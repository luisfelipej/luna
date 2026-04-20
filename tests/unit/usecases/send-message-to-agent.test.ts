import { describe, expect, it } from "bun:test";
import type { AgentBackendPort } from "../../../src/adapters/ports/agent-backend.port.ts";
import type {
  InboundHandler,
  TelegramTransport,
} from "../../../src/adapters/ports/telegram-transport.port.ts";
import { EchoBackend } from "../../../src/infra/backends/echo-backend.ts";
import { makeSendMessageToAgent } from "../../../src/usecases/send-message-to-agent.ts";

class RecordingTransport implements TelegramTransport {
  readonly sent: Array<{ chatId: number; text: string }> = [];
  async sendMessage(chatId: number, text: string): Promise<void> {
    this.sent.push({ chatId, text });
  }
  onMessage(_h: InboundHandler): void {
    /* not used in this test */
  }
  async start(): Promise<void> {
    /* noop */
  }
  async stop(): Promise<void> {
    /* noop */
  }
}

class CapturingBackend implements AgentBackendPort {
  readonly calls: Array<{ chatId: number; text: string }> = [];
  constructor(private readonly replyFn: (text: string) => string = (t) => `echo: ${t}`) {}
  async send(chatId: number, text: string) {
    this.calls.push({ chatId, text });
    return { text: this.replyFn(text) };
  }
}

describe("SendMessageToAgent (Phase 0 tracer)", () => {
  it("calls the backend and forwards the reply via the transport", async () => {
    const transport = new RecordingTransport();
    const backend = new CapturingBackend();
    const send = makeSendMessageToAgent({ backend, telegram: transport });

    await send(42, "hi");

    expect(backend.calls).toEqual([{ chatId: 42, text: "hi" }]);
    expect(transport.sent).toEqual([{ chatId: 42, text: "echo: hi" }]);
  });

  it("wires with the real EchoBackend to produce 'echo: <text>'", async () => {
    const transport = new RecordingTransport();
    const send = makeSendMessageToAgent({ backend: new EchoBackend(), telegram: transport });

    await send(7, "hello world");

    expect(transport.sent).toEqual([{ chatId: 7, text: "echo: hello world" }]);
  });
});
