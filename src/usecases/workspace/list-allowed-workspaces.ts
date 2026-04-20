import type { AllowedWorkspaceStore } from "../../adapters/ports/allowed-workspace-store.port.ts";
import type { WorkspaceHistoryStore } from "../../adapters/ports/workspace-history-store.port.ts";
import type { Workspace } from "../../entities/workspace.ts";

export interface ListAllowedWorkspacesDeps {
  readonly allowedWorkspaceStore: AllowedWorkspaceStore;
  readonly workspaceHistoryStore: WorkspaceHistoryStore;
}

export interface ListAllowedWorkspacesResult {
  readonly rows: readonly Workspace[];
  readonly currentPath: string | null;
}

/**
 * `/workspaces` — list all allow-listed paths for the chat plus the
 * currently-active one for marker rendering. Pure data; formatting lives in
 * the Telegram presenter.
 */
export function makeListAllowedWorkspaces(deps: ListAllowedWorkspacesDeps) {
  return async function listAllowedWorkspaces(chatId: number): Promise<ListAllowedWorkspacesResult> {
    const rows = await deps.allowedWorkspaceStore.list(chatId);
    const currentPath = await deps.workspaceHistoryStore.getCurrent(chatId);
    return { rows, currentPath };
  };
}

export type ListAllowedWorkspaces = ReturnType<typeof makeListAllowedWorkspaces>;
