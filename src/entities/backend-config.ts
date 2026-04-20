/**
 * The three models M1 supports. Extending this union requires a DB migration
 * review because the literal is persisted in `sessions.model`.
 */
export type Model = "opus" | "sonnet" | "haiku";

/**
 * Fully-resolved per-chat backend configuration. Produced by
 * `ResolveUserBackendConfig` (Phase 4), consumed by the Claude spawn.
 */
export interface BackendConfig {
  readonly model: Model;
  readonly timeoutS: number;
  readonly budgetUsd: number;
  readonly contextWindow: number;
}
