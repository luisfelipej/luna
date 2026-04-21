import type { SessionRow, SessionStore } from "../../../src/adapters/ports/session-store.port.ts";

/**
 * In-memory SessionStore fake — reuses the same contract suite as the SQLite
 * implementation so tests exercise both paths identically.
 */
export class FakeSessionStore implements SessionStore {
  private readonly rows = new Map<number, SessionRow>();

  async get(chatId: number): Promise<SessionRow | null> {
    return this.rows.get(chatId) ?? null;
  }

  async upsert(row: SessionRow): Promise<void> {
    this.rows.set(row.chatId, { ...row });
  }

  async clear(chatId: number): Promise<void> {
    this.rows.delete(chatId);
  }

  async addCost(chatId: number, delta: number): Promise<void> {
    const row = this.rows.get(chatId);
    if (!row) return;
    this.rows.set(chatId, { ...row, totalCostUsd: row.totalCostUsd + delta });
  }

  async listAll(): Promise<SessionRow[]> {
    return [...this.rows.values()];
  }
}
