import { describe, expect, it } from "bun:test";
import { MemFsPort } from "../../helpers/fakes/mem-fs-port.ts";
import { FakeAllowedWorkspaceStore } from "../../helpers/fakes/fake-allowed-workspace-store.ts";
import { PathConfinementError } from "../../../src/entities/errors.ts";
import { makeWorkspaceResolver } from "../../../src/usecases/workspace/workspace-resolver.ts";

const fs = () => {
  const mem = new MemFsPort();
  // Seed directories by writing placeholder files so exists() / realpath work.
  return mem;
};

describe("WorkspaceResolver", () => {
  const BASE = "/home/u/ws";

  it("resolves a relative name under WORKSPACE_BASE", async () => {
    const store = new FakeAllowedWorkspaceStore();
    const resolver = makeWorkspaceResolver({
      fs: fs(),
      allowedWorkspaceStore: store,
      workspaceBase: BASE,
    });
    const out = await resolver.resolve(42, "proj");
    expect(out).toBe("/home/u/ws/proj");
  });

  it("rejects a `..` traversal", async () => {
    const store = new FakeAllowedWorkspaceStore();
    const resolver = makeWorkspaceResolver({
      fs: fs(),
      allowedWorkspaceStore: store,
      workspaceBase: BASE,
    });
    await expect(resolver.resolve(42, "../etc")).rejects.toBeInstanceOf(PathConfinementError);
  });

  it("accepts an absolute path ONLY if allow-listed for the user", async () => {
    const store = new FakeAllowedWorkspaceStore();
    await store.add(42, "/tmp/other", new Date());
    const resolver = makeWorkspaceResolver({
      fs: fs(),
      allowedWorkspaceStore: store,
      workspaceBase: BASE,
    });
    const out = await resolver.resolve(42, "/tmp/other");
    expect(out).toBe("/tmp/other");
  });

  it("rejects an absolute path NOT in the allow-list", async () => {
    const store = new FakeAllowedWorkspaceStore();
    const resolver = makeWorkspaceResolver({
      fs: fs(),
      allowedWorkspaceStore: store,
      workspaceBase: BASE,
    });
    await expect(resolver.resolve(42, "/tmp/other")).rejects.toBeInstanceOf(PathConfinementError);
  });
});
