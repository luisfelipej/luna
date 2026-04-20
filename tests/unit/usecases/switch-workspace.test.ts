import { describe, expect, it, mock } from "bun:test";
import { FakeAllowedWorkspaceStore } from "../../helpers/fakes/fake-allowed-workspace-store.ts";
import { FakeWorkspaceHistoryStore } from "../../helpers/fakes/fake-workspace-history-store.ts";
import { FakeAgentBackend } from "../../helpers/fakes/fake-agent-backend.ts";
import { MemFsPort } from "../../helpers/fakes/mem-fs-port.ts";
import { makeWorkspaceResolver } from "../../../src/usecases/workspace/workspace-resolver.ts";
import { makeSwitchWorkspace } from "../../../src/usecases/workspace/switch-workspace.ts";

const BASE = "/home/u/ws";

function make() {
  const allow = new FakeAllowedWorkspaceStore();
  const hist = new FakeWorkspaceHistoryStore();
  const backend = new FakeAgentBackend();
  const fs = new MemFsPort();
  const resolver = makeWorkspaceResolver({
    fs,
    allowedWorkspaceStore: allow,
    workspaceBase: BASE,
  });
  const refresh = mock(async () => {});
  const switchWs = makeSwitchWorkspace({
    resolver,
    allowedWorkspaceStore: allow,
    workspaceHistoryStore: hist,
    backend,
    refreshSnapshot: refresh,
    now: () => new Date("2026-04-20T00:00:00Z"),
  });
  return { switchWs, allow, hist, backend, refresh };
}

describe("SwitchWorkspace", () => {
  it("rejects switch to non-allowed workspace", async () => {
    const { switchWs } = make();
    await expect(switchWs(42, "secret")).rejects.toThrow(/not allowed/);
  });

  it("adds history row + calls backend.changeWorkspace on success", async () => {
    const { switchWs, allow, hist, backend, refresh } = make();
    await allow.add(42, "/home/u/ws/proj", new Date());
    const out = await switchWs(42, "proj");
    expect(out.path).toBe("/home/u/ws/proj");
    expect(await hist.getCurrent(42)).toBe("/home/u/ws/proj");
    expect(backend.changeWorkspaceCalls).toEqual([{ chatId: 42, newCwd: "/home/u/ws/proj" }]);
    expect(refresh).toHaveBeenCalledTimes(1);
    // `touch` updates lastUsedAt.
    const rows = await allow.list(42);
    expect(rows[0]?.lastUsedAt).not.toBeNull();
  });
});
