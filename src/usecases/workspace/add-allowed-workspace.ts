import { isAbsolute, join } from "node:path";
import type { AllowedWorkspaceStore } from "../../adapters/ports/allowed-workspace-store.port.ts";
import type { FsPort } from "../../adapters/ports/fs.port.ts";
import { assertConfined } from "./assert-confined.ts";

export interface AddAllowedWorkspaceDeps {
  readonly fs: FsPort;
  readonly allowedWorkspaceStore: AllowedWorkspaceStore;
  readonly workspaceBase: string;
  readonly now: () => Date;
}

export interface AddAllowedWorkspaceResult {
  readonly path: string;
}

/**
 * `/workspace-allow <ref>` — add an entry to `allowed_workspaces` for the
 * chat. Relative refs are confined under WORKSPACE_BASE. Absolute paths are
 * allowed as-is (operators explicitly opting in). Any `..` traversal is
 * rejected via `assertConfined` regardless of sign.
 */
export function makeAddAllowedWorkspace(deps: AddAllowedWorkspaceDeps) {
  return async function addAllowedWorkspace(
    chatId: number,
    ref: string,
  ): Promise<AddAllowedWorkspaceResult> {
    const resolved = isAbsolute(ref) ? ref : join(deps.workspaceBase, ref);
    // For relative refs, confinement is the primary guard; for absolute refs
    // outside the base the call still runs realpath to canonicalise.
    let path: string;
    if (isAbsolute(ref)) {
      // Canonicalise via realpath (identity on MemFs, real on node).
      path = await deps.fs.realpath(ref).catch(() => ref);
      // Still reject `..` sneaking into an absolute path.
      if (ref.includes("/../") || ref.endsWith("/..")) {
        throw new Error("path must be absolute and literal");
      }
    } else {
      path = await assertConfined({
        fs: deps.fs,
        target: resolved,
        base: deps.workspaceBase,
      });
    }
    await deps.allowedWorkspaceStore.add(chatId, path, deps.now());
    return { path };
  };
}

export type AddAllowedWorkspace = ReturnType<typeof makeAddAllowedWorkspace>;
