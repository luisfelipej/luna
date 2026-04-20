import type { AgentBackendPort } from "../../adapters/ports/agent-backend.port.ts";
import type { AllowedWorkspaceStore } from "../../adapters/ports/allowed-workspace-store.port.ts";
import type { WorkspaceHistoryStore } from "../../adapters/ports/workspace-history-store.port.ts";
import { PathConfinementError } from "../../entities/errors.ts";
import type { WorkspaceResolver } from "./workspace-resolver.ts";

export interface SwitchWorkspaceDeps {
  readonly resolver: WorkspaceResolver;
  readonly allowedWorkspaceStore: AllowedWorkspaceStore;
  readonly workspaceHistoryStore: WorkspaceHistoryStore;
  readonly backend: AgentBackendPort;
  /** Called after the switch so ConfigResolverPort picks up workspace-tier YAML. */
  readonly refreshSnapshot: () => Promise<void>;
  readonly now: () => Date;
}

export interface SwitchWorkspaceResult {
  readonly path: string;
}

/**
 * `/workspace <name>` use case (spec #44).
 *
 * Steps:
 *   1. Resolve `ref` to an absolute path under WORKSPACE_BASE (or an
 *      allow-listed absolute path). Throws `PathConfinementError` on escape.
 *   2. Verify the target IS in the chat's `allowed_workspaces`. If not,
 *      reply "Workspace not allowed." — no subprocess restart.
 *   3. Update `WorkspaceHistoryStore.setCurrent` + `AllowedWorkspaceStore.touch`.
 *   4. Call `backend.changeWorkspace(chatId, path)` — pool respawn.
 *   5. Call `refreshSnapshot` so workspace-tier YAML re-enters the resolver.
 */
export function makeSwitchWorkspace(deps: SwitchWorkspaceDeps) {
  return async function switchWorkspace(
    chatId: number,
    ref: string,
  ): Promise<SwitchWorkspaceResult> {
    const path = await deps.resolver.resolve(chatId, ref);
    const allowed = await deps.allowedWorkspaceStore.has(chatId, path);
    if (!allowed) {
      throw new PathConfinementError(
        `workspace not allowed. Use /workspace-allow first: ${ref}`,
      );
    }
    const now = deps.now();
    await deps.workspaceHistoryStore.setCurrent(chatId, path);
    await deps.allowedWorkspaceStore.touch(chatId, path, now);
    await deps.backend.changeWorkspace(chatId, path);
    await deps.refreshSnapshot();
    return { path };
  };
}

export type SwitchWorkspace = ReturnType<typeof makeSwitchWorkspace>;
