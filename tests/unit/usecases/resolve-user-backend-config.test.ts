import { describe, expect, test } from "bun:test";
import type {
  ResolvableField,
  ResolvedField,
} from "../../../src/adapters/ports/config-resolver.port.ts";
import type { LoggerPort } from "../../../src/adapters/ports/logger.port.ts";
import {
  resolveUserBackendConfig,
  type ProviderFn,
  type ResolveDeps,
  type RawValue,
} from "../../../src/usecases/resolve-user-backend-config.ts";

const none: ProviderFn = () => null;

function mk(partial: Partial<ResolveDeps>): ResolveDeps {
  const base: ResolveDeps = {
    workspaceDb: partial.workspaceDb ?? none,
    workspaceYaml: partial.workspaceYaml ?? none,
    userDb: partial.userDb ?? none,
    usersYaml: partial.usersYaml ?? none,
    env: partial.env ?? none,
    defaults: partial.defaults ?? none,
  };
  return partial.logger ? { ...base, logger: partial.logger } : base;
}

const CHAT = 42;
const WS = "/w/a";

/** Convenience fixed-return provider. */
function prov(val: RawValue): ProviderFn {
  return () => val;
}

describe("resolveUserBackendConfig — per-tier isolated", () => {
  // 4 fields × 6 tiers = 24 cases
  const fieldCases: Array<{ field: ResolvableField; raw: RawValue; expected: string | number }> = [
    { field: "model", raw: "opus", expected: "opus" },
    { field: "timeoutSeconds", raw: 120, expected: 120 },
    { field: "maxBudgetUsd", raw: 2.5, expected: 2.5 },
    { field: "contextWindow", raw: 100_000, expected: 100_000 },
    { field: "idleTimeoutMin", raw: 15, expected: 15 },
  ];

  for (const { field, raw, expected } of fieldCases) {
    test(`tier 1 (workspaceDb) wins for ${field}`, () => {
      const r = resolveUserBackendConfig(
        mk({
          workspaceDb: prov(raw),
          workspaceYaml: prov(raw),
          userDb: prov(raw),
          usersYaml: prov(raw),
          env: prov(raw),
          defaults: prov(raw),
        }),
        CHAT,
        WS,
        field,
      );
      expect(r).toEqual({ value: expected, tier: 1 } satisfies ResolvedField);
    });

    test(`tier 2 (workspaceYaml) wins when tier 1 absent for ${field}`, () => {
      const r = resolveUserBackendConfig(
        mk({
          workspaceYaml: prov(raw),
          userDb: prov(raw),
          usersYaml: prov(raw),
          env: prov(raw),
          defaults: prov(raw),
        }),
        CHAT,
        WS,
        field,
      );
      expect(r).toEqual({ value: expected, tier: 2 });
    });

    test(`tier 3 (userDb) wins for ${field}`, () => {
      const r = resolveUserBackendConfig(
        mk({ userDb: prov(raw), usersYaml: prov(raw), env: prov(raw), defaults: prov(raw) }),
        CHAT,
        WS,
        field,
      );
      expect(r).toEqual({ value: expected, tier: 3 });
    });

    test(`tier 4 (usersYaml) wins for ${field}`, () => {
      const r = resolveUserBackendConfig(
        mk({ usersYaml: prov(raw), env: prov(raw), defaults: prov(raw) }),
        CHAT,
        WS,
        field,
      );
      expect(r).toEqual({ value: expected, tier: 4 });
    });

    test(`tier 5 (env) wins for ${field}`, () => {
      const r = resolveUserBackendConfig(
        mk({ env: prov(raw), defaults: prov(raw) }),
        CHAT,
        WS,
        field,
      );
      expect(r).toEqual({ value: expected, tier: 5 });
    });

    test(`tier 6 (defaults) wins when all others absent for ${field}`, () => {
      const r = resolveUserBackendConfig(mk({ defaults: prov(raw) }), CHAT, WS, field);
      expect(r).toEqual({ value: expected, tier: 6 });
    });
  }
});

describe("resolveUserBackendConfig — fallthrough + coercion + determinism", () => {
  test("returns null when every tier is absent", () => {
    expect(resolveUserBackendConfig(mk({}), CHAT, WS, "model")).toBeNull();
  });

  test("malformed model at tier 1 falls through to tier 3 and logs a warn", () => {
    const logs: Array<{ msg: string }> = [];
    const logger: LoggerPort = {
      debug: () => undefined,
      info: () => undefined,
      warn: (msg) => logs.push({ msg }),
      error: () => undefined,
      child: () => logger,
    };
    const r = resolveUserBackendConfig(
      mk({ workspaceDb: prov("foo"), userDb: prov("sonnet"), logger }),
      CHAT,
      WS,
      "model",
    );
    expect(r).toEqual({ value: "sonnet", tier: 3 });
    expect(logs).toHaveLength(1);
  });

  test("malformed number is skipped (negative timeout)", () => {
    const r = resolveUserBackendConfig(
      mk({ workspaceDb: prov(-5), userDb: prov(30) }),
      CHAT,
      WS,
      "timeoutSeconds",
    );
    expect(r).toEqual({ value: 30, tier: 3 });
  });

  test("numeric string is coerced (tier 5 env values arrive as strings)", () => {
    const r = resolveUserBackendConfig(mk({ env: prov("60") }), CHAT, WS, "timeoutSeconds");
    expect(r).toEqual({ value: 60, tier: 5 });
  });

  test("deterministic — repeated invocation returns the same ResolvedField", () => {
    const deps = mk({ workspaceYaml: prov("opus"), defaults: prov("sonnet") });
    const a = resolveUserBackendConfig(deps, CHAT, WS, "model");
    const b = resolveUserBackendConfig(deps, CHAT, WS, "model");
    expect(a).toEqual(b!);
    expect(a?.tier).toBe(2);
  });

  test("explicit collision — every tier present: tier 1 wins, not defaults", () => {
    const r = resolveUserBackendConfig(
      mk({
        workspaceDb: prov("opus"),
        workspaceYaml: prov("sonnet"),
        userDb: prov("haiku"),
        usersYaml: prov("sonnet"),
        env: prov("sonnet"),
        defaults: prov("sonnet"),
      }),
      CHAT,
      WS,
      "model",
    );
    expect(r?.value).toBe("opus");
    expect(r?.tier).toBe(1);
  });
});
