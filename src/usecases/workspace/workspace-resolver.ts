import { isAbsolute, join } from "node:path";
import type { AllowedWorkspaceStore } from "../../adapters/ports/allowed-workspace-store.port.ts";
import type { FsPort } from "../../adapters/ports/fs.port.ts";
import { PathConfinementError } from "../../entities/errors.ts";
import { assertConfined } from "./assert-confined.ts";

export interface WorkspaceResolverDeps {
  readonly fs: FsPort;
  readonly allowedWorkspaceStore: AllowedWorkspaceStore;
  readonly workspaceBase: string;
}

export interface WorkspaceResolver {
  /**
   * Resolve a user-supplied workspace reference to an absolute path.
   *
   * - Relative names MUST resolve under `workspaceBase` and pass
   *   `assertConfined`.
   * - Absolute paths are accepted ONLY when the user's
   *   `AllowedWorkspaceStore` already contains an entry for the exact
   *   realpath. This makes "/workspace add /tmp/x" + "/workspace x" the
   *   canonical way to escape the base; nothing else can.
   *
   * Any violation throws `PathConfinementError`.
   */
  resolve(chatId: number, ref: string): Promise<string>;
}

export function makeWorkspaceResolver(deps: WorkspaceResolverDeps): WorkspaceResolver {
  const { fs, allowedWorkspaceStore, workspaceBase } = deps;
  return {
    async resolve(chatId, ref) {
      if (isAbsolute(ref)) {
        const canonical = await fs.realpath(ref).catch(() => ref);
        // If the realpath falls inside the base, confinement alone is enough.
        const insideBase = await isInside(fs, canonical, workspaceBase);
        if (insideBase) {
          return assertConfined({ fs, target: ref, base: workspaceBase });
        }
        // Outside base: require allow-listed entry.
        const listed = await allowedWorkspaceStore.has(chatId, canonical);
        if (!listed) {
          throw new PathConfinementError(
            `absolute path not in allowed_workspaces: ${ref}`,
          );
        }
        return canonical;
      }
      // Relative → join under WORKSPACE_BASE, then confine.
      const target = join(workspaceBase, ref);
      return assertConfined({ fs, target, base: workspaceBase });
    },
  };
}

async function isInside(fs: FsPort, target: string, base: string): Promise<boolean> {
  try {
    await assertConfined({ fs, target, base });
    return true;
  } catch {
    return false;
  }
}
