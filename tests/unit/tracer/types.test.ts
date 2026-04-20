import { describe, expect, it } from "bun:test";
// Import the modules at runtime to prove the files actually exist.
// (bun erases `import type` so we need value imports to fail RED.)
import * as agentResponseMod from "../../../src/entities/agent-response.ts";
import * as messageMod from "../../../src/entities/message.ts";
import * as backendPortMod from "../../../src/adapters/ports/agent-backend.port.ts";
import * as transportPortMod from "../../../src/adapters/ports/telegram-transport.port.ts";
import type { AgentResponse } from "../../../src/entities/agent-response.ts";
import type { MessageLine } from "../../../src/entities/message.ts";
import type { AgentBackendPort } from "../../../src/adapters/ports/agent-backend.port.ts";
import type { TelegramTransport } from "../../../src/adapters/ports/telegram-transport.port.ts";

// keep imports used so bun doesn't strip them
void agentResponseMod;
void messageMod;
void backendPortMod;
void transportPortMod;

describe("tracer types", () => {
  it("MessageLine compiles with the expected shape", () => {
    const m: MessageLine = {
      chatId: 42,
      text: "hi",
      dir: "user",
      ts: new Date("2026-04-20T00:00:00Z").toISOString(),
    };
    expect(m.dir === "user" || m.dir === "assistant").toBe(true);
  });

  it("AgentResponse compiles with the expected shape", () => {
    const r: AgentResponse = { text: "echo: hi" };
    expect(r.text).toBe("echo: hi");
  });

  it("a fake AgentBackendPort satisfies the interface structurally", () => {
    const fake: AgentBackendPort = {
      async send(_chatId, text) {
        return { text: `echo: ${text}` };
      },
    };
    expect(typeof fake.send).toBe("function");
  });

  it("a fake TelegramTransport satisfies the interface structurally", () => {
    const fake: TelegramTransport = {
      async sendMessage() {
        /* noop */
      },
      onMessage() {
        /* noop */
      },
      async start() {
        /* noop */
      },
      async stop() {
        /* noop */
      },
    };
    expect(typeof fake.sendMessage).toBe("function");
    expect(typeof fake.onMessage).toBe("function");
  });
});
