import { describe, expect, it } from "bun:test";
import type { ResolvableField } from "../../../src/adapters/ports/config-resolver.port.ts";
import {
  buildRefreshableSnapshotResolver,
  type EnvReader,
} from "../../../src/composition/snapshot-config-resolver.ts";
import { UsersRepo } from "../../../src/infra/config/users-repo.ts";
import { WorkspacesRepo } from "../../../src/infra/config/workspaces-repo.ts";
import { FakeSettingsStore } from "../../helpers/fakes/fake-settings-store.ts";

const EMPTY_YAML: EnvReader = {};

describe("refreshable SnapshotConfigResolver", () => {
  it("sees DB writes after refresh()", async () => {
    const store = new FakeSettingsStore();
    const usersRepo = new UsersRepo("users: []");
    const wsRepo = new WorkspacesRepo("workspaces: []");
    const { resolver, refresh } = await buildRefreshableSnapshotResolver({
      settings: store,
      users: usersRepo,
      workspaces: wsRepo,
      env: EMPTY_YAML,
    });

    const field: ResolvableField = "model";
    // Baseline — tier 6 default.
    const before = resolver.resolve(42, "/any", field);
    expect(before).toEqual({ value: "sonnet", tier: 6 });

    // Write to settings store; resolver still holds the snapshot from boot.
    await store.set("user_config:42:model", "opus");
    expect(resolver.resolve(42, "/any", field)).toEqual({ value: "sonnet", tier: 6 });

    // After refresh, the tier-3 value wins.
    await refresh();
    expect(resolver.resolve(42, "/any", field)).toEqual({ value: "opus", tier: 3 });
  });
});
