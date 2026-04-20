import type { HistoryStore } from "../../../src/adapters/ports/history-store.port.ts";
import type { MessageLine } from "../../../src/entities/message.ts";

/** In-memory HistoryStore fake — retains every appended line in order. */
export class FakeHistoryStore implements HistoryStore {
  readonly appended: MessageLine[] = [];

  async append(_chatId: number, line: MessageLine): Promise<void> {
    this.appended.push(line);
  }

  async tail(chatId: number, n: number): Promise<MessageLine[]> {
    const scoped = this.appended.filter((l) => l.chatId === chatId);
    return scoped.slice(-n);
  }
}
