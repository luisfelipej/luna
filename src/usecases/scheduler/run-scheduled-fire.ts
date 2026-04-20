import type { ClockPort } from "../../adapters/ports/clock.port.ts";
import type { JobRow, JobStore } from "../../adapters/ports/job-store.port.ts";
import type { TelegramTransport } from "../../adapters/ports/telegram-transport.port.ts";
import type { LoggerPort } from "../../adapters/ports/logger.port.ts";

/**
 * Minimal scheduler surface used by `RunScheduledFire`. We depend on
 * just these two operations so the usecase stays layer-friendly.
 */
export interface SchedulerHandle {
  register(job: JobRow): Promise<void>;
  unregister(jobId: number): Promise<void>;
}

export interface RunScheduledFireAgentCall {
  readonly chatId: number;
  readonly text: string;
}

export interface AgentDelegateResult {
  readonly text: string;
}

export type AgentDelegate = (call: RunScheduledFireAgentCall) => Promise<AgentDelegateResult>;

export interface RunScheduledFireDeps {
  readonly jobStore: JobStore;
  readonly transport: TelegramTransport;
  /**
   * Closure that invokes SendMessageToAgent for the agent branch. Returns the
   * terminal assistant text so we can scan for the CONDITION_MET sentinel.
   */
  readonly sendMessageToAgent: AgentDelegate;
  readonly scheduler: SchedulerHandle;
  readonly clock: ClockPort;
  readonly logger?: LoggerPort;
}

const CONDITION_MET_MARKER = "CONDITION_MET";
const CONDITION_NOT_MET_MARKER = "CONDITION_NOT_MET";

/**
 * Executes a single fire for job `jobId`. Branches on `job_type`:
 *   - reminder → verbatim text via Telegram.
 *   - agent    → delegate to SendMessageToAgent closure. On auto_remove,
 *                scan assistant reply for CONDITION_MET / CONDITION_NOT_MET.
 *
 * Post-fire bookkeeping:
 *   - `once` jobs get `stampFired` and are unregistered from the scheduler.
 *   - interval / daily jobs remain active; LoopScheduler re-computes
 *     nextFireAt on its next wake so no explicit re-register is needed here.
 *   - On CONDITION_MET for auto_remove: delete the row + unregister + notify
 *     the chat with `Job <name> removed (condition met).`
 */
export function makeRunScheduledFire(deps: RunScheduledFireDeps) {
  return async function runScheduledFire(jobId: number): Promise<void> {
    const job = await deps.jobStore.get(jobId);
    if (!job || !job.active) return;

    try {
      if (job.jobType === "reminder") {
        await deps.transport.sendMessage(job.chatId, job.prompt);
      } else {
        const result = await deps.sendMessageToAgent({
          chatId: job.chatId,
          text: job.prompt,
        });
        if (job.autoRemove) {
          const scan = scanCondition(result.text);
          if (scan === "met") {
            await deps.jobStore.delete(job.id);
            await deps.scheduler.unregister(job.id);
            await deps.transport.sendMessage(
              job.chatId,
              `Job ${job.name} removed (condition met).`,
            );
            return;
          }
          // CONDITION_NOT_MET or no marker → leave job running
        }
      }
    } catch (err) {
      deps.logger?.error("run-scheduled-fire: fire failed", {
        jobId: job.id,
        err: String(err),
      });
      return;
    }

    if (job.schedule.kind === "once") {
      await deps.jobStore.stampFired(job.id, deps.clock.now());
      await deps.scheduler.unregister(job.id);
    }
    // For interval/daily, the scheduler re-schedules on its next wake via
    // rehydrate-on-register semantics — no explicit call needed here.
  };
}

export type RunScheduledFire = ReturnType<typeof makeRunScheduledFire>;

function scanCondition(text: string): "met" | "not_met" | "none" {
  if (text.includes(CONDITION_MET_MARKER) && !text.includes(CONDITION_NOT_MET_MARKER)) return "met";
  if (text.includes(CONDITION_NOT_MET_MARKER)) return "not_met";
  return "none";
}
