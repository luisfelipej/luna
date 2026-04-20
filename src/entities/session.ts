import type { Model } from "./backend-config.ts";

/**
 * Persisted per-chat Claude session snapshot. `sessionId` is the value the
 * Claude Code CLI expects on `--resume`; `null` means "no prior session" and
 * the next spawn omits the flag.
 */
export interface Session {
  readonly chatId: number;
  readonly sessionId: string | null;
  readonly model: Model;
  readonly totalCostUsd: number;
  readonly lastUsedAt: Date;
}
