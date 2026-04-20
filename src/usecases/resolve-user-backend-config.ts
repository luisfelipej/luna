import type {
  PrecedenceTier,
  ResolvableField,
  ResolvedField,
} from "../adapters/ports/config-resolver.port.ts";
import type { LoggerPort } from "../adapters/ports/logger.port.ts";

/**
 * Raw string/number shape each tier hands to the resolver. Each provider is
 * a pure function that looks up a field *for one precedence tier* and
 * returns either a raw (string or number) value or `null` if the tier has
 * nothing to say.
 *
 * The resolver walks tiers 1 → 6 in order; the first non-null value that
 * also survives field-type coercion wins.
 *
 * Keeping the providers as injected functions (rather than e.g. a full
 * SettingsStore) lets tests feed precomputed data and keeps the usecase
 * 100 % synchronous + pure.
 */
export type RawValue = string | number | null | undefined;

export type ProviderFn = (
  chatId: number,
  workspacePath: string,
  field: ResolvableField,
) => RawValue;

export interface ResolveDeps {
  /** Tier 1 — workspace DB override (settings table, ws-scoped key). */
  readonly workspaceDb: ProviderFn;
  /** Tier 2 — workspaces.yaml entry for the current path. */
  readonly workspaceYaml: ProviderFn;
  /** Tier 3 — per-user DB override (settings table, user-scoped key). */
  readonly userDb: ProviderFn;
  /** Tier 4 — users.yaml entry for the chat's telegram id. */
  readonly usersYaml: ProviderFn;
  /** Tier 5 — process env (LUNA_MODEL, LUNA_TIMEOUT_S, …). */
  readonly env: ProviderFn;
  /** Tier 6 — built-in hardcoded default. Always defined for known fields. */
  readonly defaults: ProviderFn;
  /** Optional — log a warn when a tier produced a malformed value. */
  readonly logger?: LoggerPort;
}

const TIERS: Array<{ tier: PrecedenceTier; key: keyof ResolveDeps }> = [
  { tier: 1, key: "workspaceDb" },
  { tier: 2, key: "workspaceYaml" },
  { tier: 3, key: "userDb" },
  { tier: 4, key: "usersYaml" },
  { tier: 5, key: "env" },
  { tier: 6, key: "defaults" },
];

const MODELS = new Set(["opus", "sonnet", "haiku"]);

/**
 * Field-type coercer table. Each entry turns a raw provider output into the
 * port's typed value. A coercer returning `null` means "malformed at this
 * tier" — the resolver logs + falls through.
 */
const COERCERS: Record<ResolvableField, (raw: RawValue) => string | number | null> = {
  model(raw) {
    if (typeof raw !== "string") return null;
    return MODELS.has(raw) ? raw : null;
  },
  timeoutSeconds(raw) {
    const n = coerceNumber(raw);
    return n !== null && Number.isInteger(n) && n > 0 ? n : null;
  },
  maxBudgetUsd(raw) {
    const n = coerceNumber(raw);
    return n !== null && n >= 0 && Number.isFinite(n) ? n : null;
  },
  contextWindow(raw) {
    const n = coerceNumber(raw);
    return n !== null && Number.isInteger(n) && n > 0 ? n : null;
  },
  idleTimeoutMin(raw) {
    const n = coerceNumber(raw);
    return n !== null && Number.isInteger(n) && n > 0 ? n : null;
  },
};

function coerceNumber(raw: RawValue): number | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

/**
 * Pure six-tier precedence walker. Returns the first non-null, coercion-
 * surviving value along with the tier that supplied it. Falls through on
 * malformed values with a WARN-level log so operators can spot bad YAML/env
 * without silently reverting to a weaker tier.
 */
export function resolveUserBackendConfig(
  deps: ResolveDeps,
  chatId: number,
  workspacePath: string,
  field: ResolvableField,
): ResolvedField | null {
  const coerce = COERCERS[field];
  for (const { tier, key } of TIERS) {
    const provider = deps[key] as ProviderFn;
    const raw = provider(chatId, workspacePath, field);
    if (raw === null || raw === undefined) continue;
    const value = coerce(raw);
    if (value === null) {
      deps.logger?.warn(
        `resolveUserBackendConfig: malformed value at tier ${tier} for ${field} — skipping`,
        { tier, field, raw },
      );
      continue;
    }
    return { value, tier };
  }
  return null;
}
