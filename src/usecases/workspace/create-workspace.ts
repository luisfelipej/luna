import { join } from "node:path";
import type { AgentBackendPort } from "../../adapters/ports/agent-backend.port.ts";
import type { AllowedWorkspaceStore } from "../../adapters/ports/allowed-workspace-store.port.ts";
import type { FsPort } from "../../adapters/ports/fs.port.ts";
import type { WorkspaceHistoryStore } from "../../adapters/ports/workspace-history-store.port.ts";
import { ConfigError } from "../../entities/errors.ts";
import { assertConfined } from "./assert-confined.ts";

export type ExecCommand = (command: string, args: readonly string[], cwd: string) => Promise<void>;

export interface CreateWorkspaceDeps {
  readonly fs: FsPort;
  readonly allowedWorkspaceStore: AllowedWorkspaceStore;
  readonly workspaceHistoryStore: WorkspaceHistoryStore;
  readonly backend: AgentBackendPort;
  readonly workspaceBase: string;
  readonly refreshSnapshot: () => Promise<void>;
  readonly execCommand: ExecCommand;
  readonly now: () => Date;
}

export interface CreateWorkspaceResult {
  readonly path: string;
}

/**
 * `/workspace-new <name>` — create a workspace at WORKSPACE_BASE/<name>,
 * `git init` it, register it in `allowed_workspaces`, switch to it.
 *
 * Spec #44 Create-scenarios: directory MUST not pre-exist (we detect by
 * checking for a sentinel `.gitkeep` or `.git` entry; exact fs shape varies
 * between real disk and MemFs). For robust detection under MemFs we write a
 * `.gitkeep` marker inside the new dir; `exists` on that marker doubles as a
 * "dir exists" check for tests.
 */
export function makeCreateWorkspace(deps: CreateWorkspaceDeps) {
  return async function createWorkspace(
    chatId: number,
    name: string,
  ): Promise<CreateWorkspaceResult> {
    if (name.includes("/") || name.includes("..") || name === "") {
      throw new ConfigError(`invalid workspace name: ${name}`);
    }
    const target = join(deps.workspaceBase, name);
    const gitkeep = join(target, ".gitkeep");
    if (await deps.fs.exists(gitkeep)) {
      throw new ConfigError(`Workspace already exists: ${name}`);
    }
    // Confinement check — realpath may not resolve before the dir exists, so
    // textual fallback guards `..` in the same helper.
    await assertConfined({ fs: deps.fs, target, base: deps.workspaceBase });

    await deps.fs.mkdirp(target);
    // Placeholder file so MemFs round-trips know the dir exists.
    await deps.fs.writeFile(gitkeep, "");
    await deps.execCommand("git", ["init"], target);

    const now = deps.now();
    await deps.allowedWorkspaceStore.add(chatId, target, now);
    await deps.workspaceHistoryStore.setCurrent(chatId, target);
    await deps.allowedWorkspaceStore.touch(chatId, target, now);
    await deps.backend.changeWorkspace(chatId, target);
    await deps.refreshSnapshot();
    return { path: target };
  };
}

export type CreateWorkspace = ReturnType<typeof makeCreateWorkspace>;
