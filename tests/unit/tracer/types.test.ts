import { describe, expect, it } from "bun:test";
import * as agentResponseMod from "../../../src/entities/agent-response.ts";
import * as messageMod from "../../../src/entities/message.ts";
import * as backendPortMod from "../../../src/adapters/ports/agent-backend.port.ts";
import * as transportPortMod from "../../../src/adapters/ports/telegram-transport.port.ts";
import type { AgentResponse } from "../../../src/entities/agent-response.ts";
import type { MessageLine } from "../../../src/entities/message.ts";
import type { AgentBackendPort } from "../../../src/adapters/ports/agent-backend.port.ts";
import type { TelegramTransport } from "../../../src/adapters/ports/telegram-transport.port.ts";
import type { StreamChunk } from "../../../src/entities/stream-chunk.ts";

void agentResponseMod;
void messageMod;
void backendPortMod;
void transportPortMod;

describe("types — entities + ports compile", () => {
  it("MessageLine compiles", () => {
    const m: MessageLine = {
      chatId: 42,
      text: "hi",
      dir: "user",
      ts: new Date("2026-04-20T00:00:00Z").toISOString(),
    };
    expect(m.dir === "user" || m.dir === "assistant").toBe(true);
  });

  it("AgentResponse compiles", () => {
    const r: AgentResponse = { text: "echo: hi" };
    expect(r.text).toBe("echo: hi");
  });

  it("a fake streaming AgentBackendPort satisfies the interface", () => {
    const fake: AgentBackendPort = {
      async *send(_chatId, text): AsyncIterable<StreamChunk> {
        yield { textSoFar: `echo: ${text}`, done: true };
      },
      async changeWorkspace() {},
      async restart() {},
      async shutdown() {},
      isAlive() {
        return false;
      },
    };
    expect(typeof fake.send).toBe("function");
  });

  it("a fake TelegramTransport satisfies the streaming interface", () => {
    const fake: TelegramTransport = {
      async sendMessage() {
        return 1;
      },
      async editMessage() {},
      async sendFile() {},
      onUpdate() {},
      async start() {},
      async stop() {},
    };
    expect(typeof fake.sendMessage).toBe("function");
    expect(typeof fake.onUpdate).toBe("function");
    expect(typeof fake.editMessage).toBe("function");
  });
});
