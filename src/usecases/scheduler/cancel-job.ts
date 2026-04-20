import type { JobStore } from "../../adapters/ports/job-store.port.ts";
import type { ScheduleJobHandle } from "../http/schedule-job.ts";

export interface CancelJobDeps {
  readonly jobStore: JobStore;
  readonly scheduler: ScheduleJobHandle;
}

/**
 * Cancel a scheduled job: delete the row + unregister from the live
 * scheduler. Returns `true` if a row was removed, `false` if the id was
 * unknown.
 */
export function makeCancelJob(deps: CancelJobDeps) {
  return async function cancelJob(jobId: number): Promise<boolean> {
    const row = await deps.jobStore.get(jobId);
    if (!row) return false;
    await deps.jobStore.delete(jobId);
    await deps.scheduler.unregister(jobId);
    return true;
  };
}

export type CancelJob = ReturnType<typeof makeCancelJob>;
