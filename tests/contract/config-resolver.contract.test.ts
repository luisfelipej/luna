import { describe, expect, test } from "bun:test";
import {
  DEFAULTS,
  SnapshotConfigResolver,
  loadSettingsSnapshot,
} from "../../src/composition/snapshot-config-resolver.ts";
import { UsersRepo } from "../../src/infra/config/users-repo.ts";
import { WorkspacesRepo } from "../../src/infra/config/workspaces-repo.ts";
import { FakeSettingsStore } from "../helpers/fakes/fake-settings-store.ts";

const USERS_YAML = `
users:
  - telegram_id: 42
    role: admin
    model: opus
    timeout_s: 600
`;

const WORKSPACES_YAML = `
workspaces:
  - path: /w/a
    claude:
      model: sonnet
      timeout_s: 400
      budget_usd: 2
      context_window: 100000
`;

async function makeResolver(settings: FakeSettingsStore, env: Record<string, string> = {}) {
  const snap = await loadSettingsSnapshot(settings);
  return new SnapshotConfigResolver({
    snapshot: snap,
    users: new UsersRepo(USERS_YAML),
    workspaces: new WorkspacesRepo(WORKSPACES_YAML),
    env,
  });
}

describe("SnapshotConfigResolver — six-tier walker", () => {
  test("tier 6 default kicks in when nothing is set", async () => {
    const resolver = await makeResolver(new FakeSettingsStore());
    const r = resolver.resolve(99, "/w/none", "contextWindow");
    expect(r).toEqual({ value: DEFAULTS.contextWindow, tier: 6 });
  });

  test("tier 5 env wins over defaults", async () => {
    const resolver = await makeResolver(new FakeSettingsStore(), { LUNA_MODEL: "haiku" });
    const r = resolver.resolve(99, "/w/none", "model");
    expect(r).toEqual({ value: "haiku", tier: 5 });
  });

  test("tier 4 users.yaml wins over env", async () => {
    const resolver = await makeResolver(new FakeSettingsStore(), { LUNA_MODEL: "haiku" });
    const r = resolver.resolve(42, "/w/none", "model");
    expect(r).toEqual({ value: "opus", tier: 4 });
  });

  test("tier 3 user DB wins over users.yaml", async () => {
    const settings = new FakeSettingsStore();
    await settings.set("user_config:42:model", "sonnet");
    const resolver = await makeResolver(settings);
    const r = resolver.resolve(42, "/w/none", "model");
    expect(r).toEqual({ value: "sonnet", tier: 3 });
  });

  test("tier 2 workspaces.yaml wins over user DB", async () => {
    const settings = new FakeSettingsStore();
    await settings.set("user_config:42:model", "sonnet");
    const resolver = await makeResolver(settings);
    const r = resolver.resolve(42, "/w/a", "model");
    expect(r).toEqual({ value: "sonnet", tier: 2 });
  });

  test("tier 1 workspace DB wins over everything", async () => {
    const settings = new FakeSettingsStore();
    await settings.set("user_config:42:model", "sonnet");
    await settings.set("ws_config:42:/w/a:model", "haiku");
    const resolver = await makeResolver(settings);
    const r = resolver.resolve(42, "/w/a", "model");
    expect(r).toEqual({ value: "haiku", tier: 1 });
  });

  test("env IDLE_TIMEOUT_MIN coerced from string", async () => {
    const resolver = await makeResolver(new FakeSettingsStore(), { IDLE_TIMEOUT_MIN: "30" });
    const r = resolver.resolve(99, "/w/none", "idleTimeoutMin");
    expect(r).toEqual({ value: 30, tier: 5 });
  });
});
