import { describe } from "bun:test";
import { GrammyTelegramTransport } from "../../src/infra/telegram/grammy-transport.ts";
import { FakeTelegramTransport } from "../helpers/fakes/fake-telegram-transport.ts";
import { runTelegramTransportContract } from "./telegram-transport.contract.ts";

describe("TelegramTransport contract — FakeTelegramTransport", () => {
  runTelegramTransportContract(() => {
    const t = new FakeTelegramTransport();
    return {
      transport: t,
      sent: () => t.sent.map((s) => ({ chatId: s.chatId, text: s.text })),
      edits: () =>
        t.edits.map((e) => ({ chatId: e.chatId, messageId: e.messageId, text: e.text })),
      files: () => t.files.slice(),
    };
  });
});

describe("TelegramTransport contract — GrammyTelegramTransport (structural mock)", () => {
  runTelegramTransportContract(() => {
    const sent: Array<{ chatId: number; text: string }> = [];
    const edits: Array<{ chatId: number; messageId: number; text: string }> = [];
    const files: Array<{ chatId: number; path: string; caption?: string }> = [];
    let nextId = 1;
    const bot = {
      api: {
        async sendMessage(chatId: number, text: string) {
          sent.push({ chatId, text });
          return { message_id: nextId++ };
        },
        async editMessageText(chatId: number, messageId: number, text: string) {
          edits.push({ chatId, messageId, text });
        },
        async sendDocument(chatId: number, path: unknown, other?: { caption?: string }) {
          const e: { chatId: number; path: string; caption?: string } = {
            chatId,
            path: String(path),
          };
          if (other?.caption !== undefined) e.caption = other.caption;
          files.push(e);
        },
        async deleteWebhook() {},
      },
      on() {},
      async start() {},
      async stop() {},
    };
    const transport = new GrammyTelegramTransport({
      botFactory: () => bot as never,
      allowList: [42],
    });
    return {
      transport,
      sent: () => sent.slice(),
      edits: () => edits.slice(),
      files: () => files.slice(),
    };
  });
});
