import type { AgentBackendPort } from "../adapters/ports/agent-backend.port.ts";
import type { TelegramTransport } from "../adapters/ports/telegram-transport.port.ts";

export interface SendMessageToAgentDeps {
  readonly backend: AgentBackendPort;
  readonly telegram: TelegramTransport;
}

/**
 * Phase-0 tracer use case: ask the backend, relay its reply to Telegram.
 * No history, no throttling, no locking — that all comes in Phase 2+.
 */
export function makeSendMessageToAgent(deps: SendMessageToAgentDeps) {
  return async function sendMessageToAgent(chatId: number, text: string): Promise<void> {
    const response = await deps.backend.send(chatId, text);
    await deps.telegram.sendMessage(chatId, response.text);
  };
}

export type SendMessageToAgent = ReturnType<typeof makeSendMessageToAgent>;
