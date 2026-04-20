import type { Model } from "../../entities/backend-config.ts";

/**
 * Row shape used by SessionStore. Mirrors the `sessions` table columns but
 * as a plain TS shape so usecases don't depend on Drizzle.
 */
export interface SessionRow {
  readonly chatId: number;
  readonly sessionId: string | null;
  readonly model: Model;
  readonly totalCostUsd: number;
  readonly lastUsedAt: Date;
}

/**
 * Persistence for per-chat Claude session state. One row per chat.
 */
export interface SessionStore {
  get(chatId: number): Promise<SessionRow | null>;
  upsert(row: SessionRow): Promise<void>;
  clear(chatId: number): Promise<void>;
  addCost(chatId: number, delta: number): Promise<void>;
}
