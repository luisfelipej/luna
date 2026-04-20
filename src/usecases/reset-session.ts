import type { AgentBackendPort } from "../adapters/ports/agent-backend.port.ts";
import type { LockPort } from "../adapters/ports/lock.port.ts";
import type { SessionStore } from "../adapters/ports/session-store.port.ts";

export interface ResetSessionDeps {
  readonly backend: AgentBackendPort;
  readonly sessionStore: SessionStore;
  readonly locks: LockPort;
}

/**
 * `/new` — clears the chat's Claude session and kills the live subprocess.
 *
 * Spec #49: the next send spawns a fresh backend without `--resume`, which
 * produces a brand-new session id.
 *
 * Idempotent — works for chats with no session row. Takes the per-chat
 * lock so an in-flight send finishes before reset.
 */
export function makeResetSession(deps: ResetSessionDeps) {
  return async function resetSession(chatId: number): Promise<void> {
    await deps.locks.withLock(chatId, async () => {
      await deps.sessionStore.clear(chatId);
      await deps.backend.restart(chatId);
    });
  };
}

export type ResetSession = ReturnType<typeof makeResetSession>;
