/**
 * Result of looking up one resolvable field. `tier` identifies which of the
 * six precedence tiers produced the value — the `/settings` command renders
 * this alongside the value ("model: sonnet (workspace DB)").
 *
 * Tiers (highest priority first):
 *   1: workspace settings override (per-chat + current ws, in `settings` table)
 *   2: workspaces.yaml entry for the current path
 *   3: per-user settings override (per-chat, in `settings` table)
 *   4: users.yaml entry for this telegram_id
 *   5: process env (LUNA_*)
 *   6: built-in default (hardcoded)
 *
 * Rationale: workspace context is more specific than user context (the same
 * user moves between workspaces). Persisted overrides at each scope win
 * over their YAML counterparts since DB writes come from live commands.
 */
export type PrecedenceTier = 1 | 2 | 3 | 4 | 5 | 6;

/** The fields the resolver knows how to walk. */
export type ResolvableField =
  | "model"
  | "timeoutSeconds"
  | "maxBudgetUsd"
  | "contextWindow"
  | "idleTimeoutMin";

export interface ResolvedField {
  readonly value: string | number;
  readonly tier: PrecedenceTier;
}

/**
 * Pure snapshot reader. Constructed from already-loaded stores at boot; no
 * I/O happens inside `resolve()`.
 */
export interface ConfigResolverPort {
  resolve(chatId: number, workspacePath: string, field: ResolvableField): ResolvedField | null;
}
