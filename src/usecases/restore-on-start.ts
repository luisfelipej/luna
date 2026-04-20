import type { CrashRecoveryPort } from "../adapters/ports/crash-recovery.port.ts";
import type { LoggerPort } from "../adapters/ports/logger.port.ts";
import type { TelegramTransport } from "../adapters/ports/telegram-transport.port.ts";

export interface RestoreOnStartDeps {
  readonly transport: TelegramTransport;
  readonly crashRecovery: CrashRecoveryPort;
  /**
   * Optional: Phase 8 scheduler rehydrate hook. A safe no-op closure during
   * Phase 6; wired to `SchedulerPort.start(fire)` once the scheduler lands.
   */
  readonly rehydrateScheduler?: () => Promise<void>;
  readonly logger?: LoggerPort;
}

const INTERRUPT_NOTICE = "Previous response was interrupted — please resend your last message.";

/**
 * Boot-time restore sequence. Executes in two independent steps so a failure
 * in one does not block the other:
 *   (a) drain CrashRecovery flags, notify each chat, clear the flag.
 *   (b) rehydrate the scheduler (Phase 8 — no-op if unbound).
 *
 * Per-chat send errors are logged and skipped; the flag stays set so the
 * next boot can retry.
 */
export function makeRestoreOnStart(deps: RestoreOnStartDeps) {
  return async function restoreOnStart(): Promise<void> {
    const pending = await deps.crashRecovery.listPending();
    for (const chatId of pending) {
      try {
        await deps.transport.sendMessage(chatId, INTERRUPT_NOTICE);
        await deps.crashRecovery.clear(chatId);
      } catch (err) {
        deps.logger?.error("restore-on-start: notify failed, flag retained", {
          chatId,
          err: String(err),
        });
      }
    }
    if (deps.rehydrateScheduler) {
      try {
        await deps.rehydrateScheduler();
      } catch (err) {
        deps.logger?.error("restore-on-start: scheduler rehydrate failed", {
          err: String(err),
        });
      }
    }
  };
}

export type RestoreOnStart = ReturnType<typeof makeRestoreOnStart>;
