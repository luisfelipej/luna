import { describe, expect, it } from "bun:test";
import type { BackendConfig, Model } from "../../../src/entities/backend-config.ts";

describe("BackendConfig + Model", () => {
  it("Model covers exactly {opus, sonnet, haiku}", () => {
    const all: Model[] = ["opus", "sonnet", "haiku"];
    for (const m of all) {
      const narrowed: string = ((): string => {
        switch (m) {
          case "opus":
          case "sonnet":
          case "haiku":
            return m;
        }
      })();
      expect(narrowed).toBe(m);
    }
  });

  it("constructs a BackendConfig", () => {
    const cfg: BackendConfig = {
      model: "sonnet",
      timeoutS: 300,
      budgetUsd: 2,
      contextWindow: 100000,
    };
    expect(cfg.model).toBe("sonnet");
  });
});
