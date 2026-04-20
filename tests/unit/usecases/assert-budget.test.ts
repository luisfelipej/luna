import { describe, expect, it } from "bun:test";
import { RateLimitError } from "../../../src/entities/errors.ts";
import { assertBudgetOk, evaluateBudget } from "../../../src/usecases/guards/assert-budget.ts";

describe("evaluateBudget", () => {
  it("returns ok below 80%", () => {
    expect(evaluateBudget({ priorUsd: 0, deltaUsd: 0.1, maxBudgetUsd: 1 })).toEqual({
      kind: "ok",
      totalUsd: 0.1,
    });
  });
  it("returns warn at or above 80%", () => {
    const out = evaluateBudget({ priorUsd: 0.5, deltaUsd: 0.3, maxBudgetUsd: 1 });
    expect(out.kind).toBe("warn");
  });
  it("returns exceeded above 100%", () => {
    const out = evaluateBudget({ priorUsd: 0.9, deltaUsd: 0.2, maxBudgetUsd: 1 });
    expect(out.kind).toBe("exceeded");
  });
  it("disables when maxBudgetUsd is 0", () => {
    expect(evaluateBudget({ priorUsd: 1_000, deltaUsd: 1_000, maxBudgetUsd: 0 }).kind).toBe("ok");
  });
  it("honours custom warnAt", () => {
    const out = evaluateBudget({ priorUsd: 0.4, deltaUsd: 0.1, maxBudgetUsd: 1, warnAt: 0.5 });
    expect(out.kind).toBe("warn");
  });
});

describe("assertBudgetOk", () => {
  it("throws RateLimitError on exceeded", () => {
    expect(() => assertBudgetOk({ kind: "exceeded", totalUsd: 1.5, maxUsd: 1 })).toThrow(
      RateLimitError,
    );
  });
  it("does not throw on warn or ok", () => {
    assertBudgetOk({ kind: "ok", totalUsd: 0 });
    assertBudgetOk({ kind: "warn", totalUsd: 0.9, maxUsd: 1 });
  });
});
