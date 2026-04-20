import { ConfigError } from "../../entities/errors.ts";
import type { Schedule, JobType } from "../../entities/job.ts";
import type { JobRow, JobStore } from "../../adapters/ports/job-store.port.ts";

export interface ScheduleJobHandle {
  register(job: JobRow): Promise<void>;
  unregister(jobId: number): Promise<void>;
}

export interface ScheduleJobInput {
  readonly chatId: number;
  readonly name: string;
  readonly jobType: JobType;
  readonly prompt: string;
  readonly schedule: Schedule;
  readonly autoRemove?: boolean;
}

export interface ScheduleJobOutput {
  readonly id: number;
  /** True once persisted + registered (Phase 8). */
  readonly accepted: boolean;
}

export interface ScheduleJobDeps {
  readonly jobStore: JobStore;
  /**
   * Optional scheduler handle. If supplied, newly-persisted jobs are
   * immediately registered so they fire without waiting for a rehydrate.
   * HTTP route tests can omit it to keep the stub shape.
   */
  readonly scheduler?: ScheduleJobHandle;
}

/**
 * Persist a job record + register it with the live scheduler (Phase 8).
 * The scheduler handle is optional so legacy callers / isolated tests can
 * still exercise the persistence path alone.
 */
export function makeScheduleJob(deps: ScheduleJobDeps) {
  return async (input: ScheduleJobInput): Promise<ScheduleJobOutput> => {
    assertSchedule(input.schedule);
    const id = await deps.jobStore.insert({
      chatId: input.chatId,
      name: input.name,
      jobType: input.jobType,
      prompt: input.prompt,
      schedule: input.schedule,
      active: true,
      autoRemove: input.autoRemove ?? false,
      createdAt: new Date(),
    });
    if (deps.scheduler) {
      const row = await deps.jobStore.get(id);
      if (row) await deps.scheduler.register(row);
    }
    return { id, accepted: true };
  };
}

function assertSchedule(s: Schedule): void {
  if (typeof s !== "object" || s === null || typeof (s as { kind?: unknown }).kind !== "string") {
    throw new ConfigError("schedule is required");
  }
  if (s.kind === "once" || s.kind === "interval" || s.kind === "daily") return;
  throw new ConfigError(`unknown schedule kind: ${(s as { kind: string }).kind}`);
}
