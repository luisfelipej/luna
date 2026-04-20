import type { JobRow } from "./job-store.port.ts";

/** Callback the scheduler invokes when a job's time arrives. */
export type SchedulerFire = (jobId: number) => Promise<void>;

/**
 * Cron-like scheduler. `start()` loads all active jobs, computes fire times
 * (with catch-up for past-due `once` jobs), and wakes on the earliest.
 * `register()` and `unregister()` mutate the live heap so the HTTP API can
 * add / pause jobs without a restart.
 */
export interface SchedulerPort {
  start(fire: SchedulerFire): Promise<void>;
  register(job: JobRow): Promise<void>;
  unregister(jobId: number): Promise<void>;
  stop(): Promise<void>;
}
