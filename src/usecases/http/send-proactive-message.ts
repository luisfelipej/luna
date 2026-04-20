import { AuthError } from "../../entities/errors.ts";
import type { TelegramTransport } from "../../adapters/ports/telegram-transport.port.ts";

export interface SendProactiveMessageDeps {
  readonly transport: TelegramTransport;
  readonly allowList: readonly number[];
}

export type SendProactiveMessageInput =
  | { readonly chatId: number; readonly text: string }
  | { readonly chatId: number; readonly filePath: string; readonly caption?: string };

/**
 * Thin wrapper around `TelegramTransport.sendMessage` / `sendFile` that
 * enforces the allow-list before delivery. Used by the HTTP routes
 * `POST /api/send-message` + `POST /api/send-file`.
 */
export function makeSendProactiveMessage(deps: SendProactiveMessageDeps) {
  const allow = new Set(deps.allowList);
  return async (input: SendProactiveMessageInput): Promise<void> => {
    if (!allow.has(input.chatId)) {
      throw new AuthError(`chat_id ${input.chatId} is not allow-listed`);
    }
    if ("text" in input) {
      await deps.transport.sendMessage(input.chatId, input.text);
    } else {
      await deps.transport.sendFile(input.chatId, input.filePath, input.caption);
    }
  };
}
