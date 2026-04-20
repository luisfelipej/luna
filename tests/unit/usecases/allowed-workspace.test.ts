import { describe, expect, it } from "bun:test";
import { FakeAllowedWorkspaceStore } from "../../helpers/fakes/fake-allowed-workspace-store.ts";
import { FakeWorkspaceHistoryStore } from "../../helpers/fakes/fake-workspace-history-store.ts";
import { MemFsPort } from "../../helpers/fakes/mem-fs-port.ts";
import { makeAddAllowedWorkspace } from "../../../src/usecases/workspace/add-allowed-workspace.ts";
import { makeRemoveAllowedWorkspace } from "../../../src/usecases/workspace/remove-allowed-workspace.ts";
import { makeListAllowedWorkspaces } from "../../../src/usecases/workspace/list-allowed-workspaces.ts";
import { PathConfinementError } from "../../../src/entities/errors.ts";

const BASE = "/home/u/ws";

describe("AddAllowedWorkspace", () => {
  it("inserts absolute path under base after confinement passes", async () => {
    const store = new FakeAllowedWorkspaceStore();
    const add = makeAddAllowedWorkspace({
      fs: new MemFsPort(),
      allowedWorkspaceStore: store,
      workspaceBase: BASE,
      now: () => new Date("2026-04-20T00:00:00Z"),
    });
    const out = await add(42, "proj");
    expect(out.path).toBe("/home/u/ws/proj");
    expect(await store.has(42, "/home/u/ws/proj")).toBe(true);
  });

  it("inserts absolute path outside base as-is", async () => {
    const store = new FakeAllowedWorkspaceStore();
    const add = makeAddAllowedWorkspace({
      fs: new MemFsPort(),
      allowedWorkspaceStore: store,
      workspaceBase: BASE,
      now: () => new Date(),
    });
    const out = await add(42, "/tmp/other");
    expect(out.path).toBe("/tmp/other");
    expect(await store.has(42, "/tmp/other")).toBe(true);
  });

  it("rejects `..` traversal", async () => {
    const store = new FakeAllowedWorkspaceStore();
    const add = makeAddAllowedWorkspace({
      fs: new MemFsPort(),
      allowedWorkspaceStore: store,
      workspaceBase: BASE,
      now: () => new Date(),
    });
    await expect(add(42, "../etc")).rejects.toBeInstanceOf(PathConfinementError);
  });
});

describe("RemoveAllowedWorkspace", () => {
  it("removes by resolved path", async () => {
    const store = new FakeAllowedWorkspaceStore();
    await store.add(42, "/home/u/ws/proj", new Date());
    const rm = makeRemoveAllowedWorkspace({
      fs: new MemFsPort(),
      allowedWorkspaceStore: store,
      workspaceBase: BASE,
    });
    await rm(42, "proj");
    expect(await store.has(42, "/home/u/ws/proj")).toBe(false);
  });
});

describe("ListAllowedWorkspaces", () => {
  it("returns rows with the current marker derived from history", async () => {
    const allow = new FakeAllowedWorkspaceStore();
    const hist = new FakeWorkspaceHistoryStore();
    await allow.add(42, "/home/u/ws/a", new Date());
    await allow.add(42, "/home/u/ws/b", new Date());
    await hist.setCurrent(42, "/home/u/ws/b");
    const list = makeListAllowedWorkspaces({
      allowedWorkspaceStore: allow,
      workspaceHistoryStore: hist,
    });
    const { rows, currentPath } = await list(42);
    expect(rows.length).toBe(2);
    expect(currentPath).toBe("/home/u/ws/b");
  });
});
