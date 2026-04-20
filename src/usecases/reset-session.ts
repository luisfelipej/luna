import type { AgentBackendPort } from "../adapters/ports/agent-backend.port.ts";
import type { LockPort } from "../adapters/ports/lock.port.ts";
import type { SessionStore } from "../adapters/ports/session-store.port.ts";

export interface ResetSessionDeps {
  readonly backend: AgentBackendPort;
  readonly sessionStore: SessionStore;
  /**
   * Deprecated — kept for call-site compatibility. Locking now lives inside
   * `backend.restart` (PooledClaudeBackend). A future commit can drop this
   * field.
   */
  readonly locks?: LockPort;
}

/**
 * `/new` — clears the chat's Claude session and kills the live subprocess.
 *
 * Spec #49: the next send spawns a fresh backend without `--resume`, which
 * produces a brand-new session id.
 *
 * Idempotent — works for chats with no session row. The `backend.restart`
 * implementation (`PooledClaudeBackend.restart`) acquires the per-chat lock
 * internally, so this usecase does NOT wrap its body in another lock —
 * AsyncMutex is non-reentrant and a second acquire would deadlock.
 *
 * Ordering is sound either way:
 *   - concurrent send already started → restart kills the subprocess
 *     mid-stream; the stream loop exits via the abort handler.
 *   - concurrent send not yet started → it will see the cleared session and
 *     spawn without `--resume`.
 */
export function makeResetSession(deps: ResetSessionDeps) {
  return async function resetSession(chatId: number): Promise<void> {
    await deps.sessionStore.clear(chatId);
    await deps.backend.restart(chatId);
  };
}

export type ResetSession = ReturnType<typeof makeResetSession>;
