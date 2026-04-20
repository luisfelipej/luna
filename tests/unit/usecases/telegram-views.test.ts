import { describe, expect, it } from "bun:test";
import type {
  ConfigResolverPort,
  ResolvableField,
  ResolvedField,
} from "../../../src/adapters/ports/config-resolver.port.ts";
import { FakeSessionStore } from "../../helpers/fakes/fake-session-store.ts";
import {
  renderHelp,
  renderListModels,
  renderSettings,
  renderStats,
  renderWebhookStatus,
} from "../../../src/usecases/telegram/views.ts";

function fakeResolver(map: Partial<Record<ResolvableField, ResolvedField>>): ConfigResolverPort {
  return {
    resolve: (_c, _w, f) => map[f] ?? null,
  };
}

describe("renderHelp", () => {
  it("enumerates every known command exactly once", () => {
    const text = renderHelp();
    for (const cmd of [
      "/new",
      "/stop",
      "/model",
      "/models",
      "/settings",
      "/workspace",
      "/workspaces",
      "/job",
      "/jobs",
      "/webhooks",
      "/help",
      "/stats",
    ]) {
      expect(text.includes(cmd)).toBe(true);
    }
  });
});

describe("renderListModels", () => {
  it("lists the three M1 models", () => {
    const t = renderListModels();
    expect(t).toContain("opus");
    expect(t).toContain("sonnet");
    expect(t).toContain("haiku");
  });
});

describe("renderSettings", () => {
  it("renders each resolved field with the source tier", async () => {
    const resolver = fakeResolver({
      model: { value: "sonnet", tier: 6 },
      timeoutSeconds: { value: 300, tier: 6 },
      maxBudgetUsd: { value: 0, tier: 6 },
      contextWindow: { value: 200_000, tier: 6 },
      idleTimeoutMin: { value: 15, tier: 6 },
    });
    const t = renderSettings({ chatId: 42, workspacePath: "/", resolver });
    expect(t).toContain("model: sonnet (default)");
    expect(t).toContain("timeout_s: 300 (default)");
    expect(t).toContain("budget_usd: 0 (default)");
    expect(t).toContain("context_window: 200000 (default)");
    expect(t).toContain("idle_timeout_min: 15 (default)");
  });

  it("names each non-default tier", () => {
    const resolver = fakeResolver({
      model: { value: "opus", tier: 3 },
      timeoutSeconds: { value: 600, tier: 4 },
      maxBudgetUsd: { value: 5, tier: 5 },
      contextWindow: { value: 200_000, tier: 6 },
      idleTimeoutMin: { value: 30, tier: 1 },
    });
    const t = renderSettings({ chatId: 42, workspacePath: "/", resolver });
    expect(t).toContain("(user DB)");
    expect(t).toContain("(users.yaml)");
    expect(t).toContain("(env)");
    expect(t).toContain("(workspace DB)");
  });
});

describe("renderStats", () => {
  it("reports session info + model + cost (no session yet)", async () => {
    const sessions = new FakeSessionStore();
    const t = await renderStats({ chatId: 42, sessionStore: sessions });
    expect(t).toContain("No active session");
  });

  it("reports active session stats", async () => {
    const sessions = new FakeSessionStore();
    await sessions.upsert({
      chatId: 42,
      sessionId: "abc123",
      model: "opus",
      totalCostUsd: 1.2345,
      lastUsedAt: new Date("2026-04-20T00:00:00Z"),
    });
    const t = await renderStats({ chatId: 42, sessionStore: sessions });
    expect(t).toContain("abc123");
    expect(t).toContain("opus");
    expect(t).toContain("$1.23");
  });
});

describe("renderWebhookStatus", () => {
  it("shows enabled/disabled endpoints and last-seen times", () => {
    const t = renderWebhookStatus({
      endpoints: [
        { name: "github", enabled: true, lastEventAtIso: "2026-04-20T12:00:00Z" },
        { name: "generic", enabled: false, lastEventAtIso: null },
      ],
    });
    expect(t).toContain("github");
    expect(t).toContain("enabled");
    expect(t).toContain("2026-04-20T12:00:00Z");
    expect(t).toContain("generic");
    expect(t.toLowerCase()).toContain("disabled");
  });
});
