import type { BackendConfig } from "../../entities/backend-config.ts";

/**
 * Result of looking up one BackendConfig field. `tier` identifies which of
 * the six precedence tiers produced the value — the `/settings` command
 * renders this alongside the value ("model: sonnet (user DB)").
 *
 * Tiers (highest priority first):
 *   1: per-chat override (user wrote via Telegram — settings table)
 *   2: users.yaml entry for this telegram_id
 *   3: workspace override persisted to settings table
 *   4: workspaces.yaml entry for the current path
 *   5: process env (LUNA_*)
 *   6: built-in default
 */
export type PrecedenceTier = 1 | 2 | 3 | 4 | 5 | 6;

export interface ResolvedField {
  readonly value: string | number;
  readonly tier: PrecedenceTier;
}

/**
 * Pure snapshot reader. Constructed from already-loaded stores at boot; no
 * I/O happens inside `resolve()`.
 */
export interface ConfigResolverPort {
  resolve(chatId: number, workspacePath: string, field: keyof BackendConfig): ResolvedField | null;
}
