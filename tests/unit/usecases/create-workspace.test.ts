import { describe, expect, it, mock } from "bun:test";
import { FakeAllowedWorkspaceStore } from "../../helpers/fakes/fake-allowed-workspace-store.ts";
import { FakeWorkspaceHistoryStore } from "../../helpers/fakes/fake-workspace-history-store.ts";
import { FakeAgentBackend } from "../../helpers/fakes/fake-agent-backend.ts";
import { MemFsPort } from "../../helpers/fakes/mem-fs-port.ts";
import { makeCreateWorkspace } from "../../../src/usecases/workspace/create-workspace.ts";

describe("CreateWorkspace", () => {
  it("mkdirs dir, runs git init, adds to allow-list, updates history, calls backend", async () => {
    const fs = new MemFsPort();
    const allow = new FakeAllowedWorkspaceStore();
    const hist = new FakeWorkspaceHistoryStore();
    const backend = new FakeAgentBackend();
    const refresh = mock(async () => {});
    const execCommand = mock(async (_cmd: string, _args: string[], _cwd: string) => {});

    const create = makeCreateWorkspace({
      fs,
      allowedWorkspaceStore: allow,
      workspaceHistoryStore: hist,
      backend,
      workspaceBase: "/home/u/ws",
      refreshSnapshot: refresh,
      execCommand,
      now: () => new Date("2026-04-20T00:00:00Z"),
    });

    const out = await create(42, "newp");
    expect(out.path).toBe("/home/u/ws/newp");
    expect(await fs.exists("/home/u/ws/newp/.gitkeep")).toBe(true);
    expect(execCommand).toHaveBeenCalledTimes(1);
    expect(execCommand.mock.calls[0]).toEqual(["git", ["init"], "/home/u/ws/newp"]);
    expect(await allow.has(42, "/home/u/ws/newp")).toBe(true);
    expect(await hist.getCurrent(42)).toBe("/home/u/ws/newp");
    expect(backend.changeWorkspaceCalls).toEqual([
      { chatId: 42, newCwd: "/home/u/ws/newp" },
    ]);
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("fails when directory already exists", async () => {
    const fs = new MemFsPort();
    await fs.writeFile("/home/u/ws/newp/.gitkeep", "");
    const allow = new FakeAllowedWorkspaceStore();
    const hist = new FakeWorkspaceHistoryStore();
    const backend = new FakeAgentBackend();

    const create = makeCreateWorkspace({
      fs,
      allowedWorkspaceStore: allow,
      workspaceHistoryStore: hist,
      backend,
      workspaceBase: "/home/u/ws",
      refreshSnapshot: async () => {},
      execCommand: async () => {},
      now: () => new Date(),
    });

    await expect(create(42, "newp")).rejects.toThrow(/already exists/);
  });
});
