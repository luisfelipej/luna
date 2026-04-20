/**
 * A scheduled task. One of three schedule shapes, persisted as a JSON blob
 * in `jobs.schedule_data`. Scheduler logic lives in Phase 8.
 */
export type Schedule =
  | { readonly kind: "once"; readonly atIso: string }
  | {
      readonly kind: "interval";
      readonly seconds: number;
      readonly firstRunIso?: string;
    }
  | { readonly kind: "daily"; readonly timesUtc: readonly string[] };

export type JobType = "reminder" | "agent";

export interface Job {
  readonly id: number;
  readonly chatId: number;
  readonly name: string;
  readonly jobType: JobType;
  readonly prompt: string;
  readonly schedule: Schedule;
  readonly active: boolean;
  readonly autoRemove: boolean;
  readonly firedAt: Date | null;
  readonly createdAt: Date;
}
