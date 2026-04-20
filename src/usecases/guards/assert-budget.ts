import { RateLimitError } from "../../entities/errors.ts";

/**
 * Budget accounting outcome for a single streamed message.
 *
 * `ok`: stream completed under 80% of `maxBudgetUsd`.
 * `warn`: stream completed between 80% and 100% — send a warning bubble.
 * `exceeded`: stream cost would push the running total over 100% — caller
 *             aborts and raises a RateLimitError.
 */
export type BudgetOutcome =
  | { readonly kind: "ok"; readonly totalUsd: number }
  | { readonly kind: "warn"; readonly totalUsd: number; readonly maxUsd: number }
  | { readonly kind: "exceeded"; readonly totalUsd: number; readonly maxUsd: number };

export interface AssertBudgetInput {
  /** Previous cumulative spend for this chat (USD). */
  readonly priorUsd: number;
  /** Incremental spend from the message just streamed (USD). */
  readonly deltaUsd: number;
  /** Per-chat ceiling. `0` disables the check (M1 convention). */
  readonly maxBudgetUsd: number;
  /** Warning threshold fraction; 0.8 per design. */
  readonly warnAt?: number;
}

/**
 * Pure budget evaluation. Caller decides what to do with the outcome.
 */
export function evaluateBudget(input: AssertBudgetInput): BudgetOutcome {
  const total = input.priorUsd + input.deltaUsd;
  if (input.maxBudgetUsd <= 0) return { kind: "ok", totalUsd: total };
  const warnAt = (input.warnAt ?? 0.8) * input.maxBudgetUsd;
  if (total > input.maxBudgetUsd) {
    return { kind: "exceeded", totalUsd: total, maxUsd: input.maxBudgetUsd };
  }
  if (total >= warnAt) {
    return { kind: "warn", totalUsd: total, maxUsd: input.maxBudgetUsd };
  }
  return { kind: "ok", totalUsd: total };
}

/** Throws a RateLimitError when the outcome is `exceeded`. */
export function assertBudgetOk(outcome: BudgetOutcome): void {
  if (outcome.kind === "exceeded") {
    throw new RateLimitError(
      `Budget exceeded: $${outcome.totalUsd.toFixed(2)} > $${outcome.maxUsd.toFixed(2)}`,
    );
  }
}
