import { isAbsolute, join } from "node:path";
import type { AllowedWorkspaceStore } from "../../adapters/ports/allowed-workspace-store.port.ts";
import type { FsPort } from "../../adapters/ports/fs.port.ts";

export interface RemoveAllowedWorkspaceDeps {
  readonly fs: FsPort;
  readonly allowedWorkspaceStore: AllowedWorkspaceStore;
  readonly workspaceBase: string;
}

/**
 * `/workspace-deny <ref>` — remove an entry. The ref is resolved with the
 * same rules as Add (relative → under base; absolute → realpath) but no
 * confinement error is raised; the worst case is "nothing to remove".
 */
export function makeRemoveAllowedWorkspace(deps: RemoveAllowedWorkspaceDeps) {
  return async function removeAllowedWorkspace(chatId: number, ref: string): Promise<void> {
    const resolved = isAbsolute(ref) ? ref : join(deps.workspaceBase, ref);
    const path = await deps.fs.realpath(resolved).catch(() => resolved);
    await deps.allowedWorkspaceStore.remove(chatId, path);
  };
}

export type RemoveAllowedWorkspace = ReturnType<typeof makeRemoveAllowedWorkspace>;
