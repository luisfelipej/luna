import type {
  EditMessageOpts,
  SendMessageOpts,
  TelegramTransport,
  TelegramUpdateHandler,
} from "../../../src/adapters/ports/telegram-transport.port.ts";
import type { TelegramUpdate } from "../../../src/entities/telegram-update.ts";

export interface FakeTelegramRecord {
  readonly sent: Array<{ chatId: number; text: string; markdown?: boolean }>;
  readonly edits: Array<{
    chatId: number;
    messageId: number;
    text: string;
    markdown?: boolean;
  }>;
  readonly files: Array<{ chatId: number; path: string; caption?: string }>;
}

/**
 * In-memory TelegramTransport for unit + contract tests. Mirrors the
 * semantics of `GrammyTelegramTransport` just enough that the shared
 * contract suite is meaningful for both paths.
 */
export class FakeTelegramTransport implements TelegramTransport {
  readonly sent: FakeTelegramRecord["sent"] = [];
  readonly edits: FakeTelegramRecord["edits"] = [];
  readonly files: FakeTelegramRecord["files"] = [];
  private handler: TelegramUpdateHandler | null = null;
  private nextId = 1;

  async sendMessage(chatId: number, text: string, opts?: SendMessageOpts): Promise<number> {
    const entry: { chatId: number; text: string; markdown?: boolean } = { chatId, text };
    if (opts?.markdown !== undefined) entry.markdown = opts.markdown;
    this.sent.push(entry);
    return this.nextId++;
  }

  async editMessage(
    chatId: number,
    messageId: number,
    text: string,
    opts?: EditMessageOpts,
  ): Promise<void> {
    const entry: { chatId: number; messageId: number; text: string; markdown?: boolean } = {
      chatId,
      messageId,
      text,
    };
    if (opts?.markdown !== undefined) entry.markdown = opts.markdown;
    this.edits.push(entry);
  }

  async sendFile(chatId: number, path: string, caption?: string): Promise<void> {
    const entry: { chatId: number; path: string; caption?: string } = { chatId, path };
    if (caption !== undefined) entry.caption = caption;
    this.files.push(entry);
  }

  onUpdate(handler: TelegramUpdateHandler): void {
    this.handler = handler;
  }

  async start(): Promise<void> {
    /* no-op */
  }

  async stop(): Promise<void> {
    /* no-op */
  }

  async deliver(update: TelegramUpdate): Promise<void> {
    if (!this.handler) throw new Error("FakeTelegramTransport: no handler registered");
    await this.handler(update);
  }
}
