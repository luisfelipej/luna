import { ConfigError } from "../../entities/errors.ts";
import type { Schedule, JobType } from "../../entities/job.ts";
import type { JobStore } from "../../adapters/ports/job-store.port.ts";

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
  /** Phase 7 stub — always `true` when persisted; Phase 8 wires a real scheduler. */
  readonly accepted: boolean;
}

export interface ScheduleJobDeps {
  readonly jobStore: JobStore;
}

/**
 * Phase 7 stub: persist a job record via the store + return its id, but do
 * NOT register it with a live scheduler (that's Phase 8). The HTTP route
 * therefore returns 202 Accepted with the persisted id so the client can
 * correlate once scheduling goes live.
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
