import type {
  SessionRow,
  SessionStore,
} from "../../adapters/ports/session-store.port.ts";
import type { Model } from "../../entities/backend-config.ts";
import type { LunaDb } from "./client.ts";

interface Row {
  chat_id: number;
  session_id: string | null;
  model: Model;
  total_cost_usd: number;
  last_used_at: string;
}

/**
 * SQLite-backed SessionStore. One row per chat in the `sessions` table;
 * `upsert` uses `INSERT … ON CONFLICT` so the same chat can be re-saved
 * without a separate update branch.
 */
export class SqliteSessionStore implements SessionStore {
  constructor(private readonly db: LunaDb) {}

  async get(chatId: number): Promise<SessionRow | null> {
    const row = this.db.$raw
      .prepare(
        "SELECT chat_id, session_id, model, total_cost_usd, last_used_at FROM sessions WHERE chat_id = ?",
      )
      .get(chatId) as Row | undefined;
    if (!row) return null;
    return this.toPort(row);
  }

  async upsert(row: SessionRow): Promise<void> {
    this.db.$raw
      .prepare(
        `INSERT INTO sessions (chat_id, session_id, model, total_cost_usd, last_used_at)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(chat_id) DO UPDATE SET
           session_id = excluded.session_id,
           model = excluded.model,
           total_cost_usd = excluded.total_cost_usd,
           last_used_at = excluded.last_used_at`,
      )
      .run(
        row.chatId,
        row.sessionId,
        row.model,
        row.totalCostUsd,
        row.lastUsedAt.toISOString(),
      );
  }

  async clear(chatId: number): Promise<void> {
    this.db.$raw.prepare("DELETE FROM sessions WHERE chat_id = ?").run(chatId);
  }

  async addCost(chatId: number, delta: number): Promise<void> {
    this.db.$raw
      .prepare("UPDATE sessions SET total_cost_usd = total_cost_usd + ? WHERE chat_id = ?")
      .run(delta, chatId);
  }

  private toPort(r: Row): SessionRow {
    return {
      chatId: r.chat_id,
      sessionId: r.session_id,
      model: r.model,
      totalCostUsd: r.total_cost_usd,
      lastUsedAt: new Date(r.last_used_at),
    };
  }
}
