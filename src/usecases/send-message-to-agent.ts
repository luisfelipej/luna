import type { AgentBackendPort } from "../adapters/ports/agent-backend.port.ts";
import type { TelegramTransport } from "../adapters/ports/telegram-transport.port.ts";
import type { BackendConfig } from "../entities/backend-config.ts";

export interface SendMessageToAgentDeps {
  readonly backend: AgentBackendPort;
  readonly telegram: TelegramTransport;
  /**
   * Temporary (Phase 2): a default config used by the tracer wiring until
   * Task 5.7 wires in ResolveUserBackendConfig + budget guard + locking.
   */
  readonly defaultConfig: BackendConfig;
}

/**
 * Phase-0/2 tracer use case: drain the backend stream, relay the final text.
 * No history, no throttling, no locking — that all comes in Phase 5.7.
 */
export function makeSendMessageToAgent(deps: SendMessageToAgentDeps) {
  return async function sendMessageToAgent(chatId: number, text: string): Promise<void> {
    const controller = new AbortController();
    let finalText = "";
    for await (const chunk of deps.backend.send(
      chatId,
      text,
      deps.defaultConfig,
      controller.signal,
    )) {
      finalText = chunk.textSoFar;
    }
    await deps.telegram.sendMessage(chatId, finalText);
  };
}

export type SendMessageToAgent = ReturnType<typeof makeSendMessageToAgent>;
