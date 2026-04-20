import { describe, expect, it } from "bun:test";
import type { AgentBackendPort } from "../../../src/adapters/ports/agent-backend.port.ts";
import type { TelegramTransport } from "../../../src/adapters/ports/telegram-transport.port.ts";
import type { BackendConfig } from "../../../src/entities/backend-config.ts";
import type { StreamChunk } from "../../../src/entities/stream-chunk.ts";
import { EchoBackend } from "../../../src/infra/backends/echo-backend.ts";
import { makeSendMessageToAgent } from "../../../src/usecases/send-message-to-agent.ts";

const DEFAULT_CFG: BackendConfig = {
  model: "sonnet",
  timeoutS: 300,
  budgetUsd: 0,
  contextWindow: 200_000,
};

class RecordingTransport implements TelegramTransport {
  readonly sent: Array<{ chatId: number; text: string }> = [];
  async sendMessage(chatId: number, text: string): Promise<number> {
    this.sent.push({ chatId, text });
    return this.sent.length;
  }
  async editMessage(): Promise<void> {}
  async sendFile(): Promise<void> {}
  onUpdate(): void {}
  async start(): Promise<void> {}
  async stop(): Promise<void> {}
}

class CapturingBackend implements AgentBackendPort {
  readonly calls: Array<{ chatId: number; text: string }> = [];
  constructor(private readonly replyFn: (text: string) => string = (t) => `echo: ${t}`) {}
  async *send(chatId: number, text: string): AsyncIterable<StreamChunk> {
    this.calls.push({ chatId, text });
    yield { textSoFar: this.replyFn(text), done: true };
  }
  async changeWorkspace(): Promise<void> {}
  async restart(): Promise<void> {}
  async shutdown(): Promise<void> {}
  isAlive(): boolean {
    return false;
  }
}

describe("SendMessageToAgent (tracer shape)", () => {
  it("calls the backend and forwards the reply via the transport", async () => {
    const transport = new RecordingTransport();
    const backend = new CapturingBackend();
    const send = makeSendMessageToAgent({
      backend,
      telegram: transport,
      defaultConfig: DEFAULT_CFG,
    });

    await send(42, "hi");

    expect(backend.calls).toEqual([{ chatId: 42, text: "hi" }]);
    expect(transport.sent).toEqual([{ chatId: 42, text: "echo: hi" }]);
  });

  it("wires with the real EchoBackend to produce 'echo: <text>'", async () => {
    const transport = new RecordingTransport();
    const send = makeSendMessageToAgent({
      backend: new EchoBackend(),
      telegram: transport,
      defaultConfig: DEFAULT_CFG,
    });

    await send(7, "hello world");

    expect(transport.sent).toEqual([{ chatId: 7, text: "echo: hello world" }]);
  });
});
