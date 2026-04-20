import type { Job, JobType, Schedule } from "../../entities/job.ts";

/**
 * Row shape used by JobStore. Matches the `jobs` table.
 */
export interface JobRow {
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

/** Data needed to insert a new job — id + firedAt are assigned by the store. */
export type NewJob = Omit<JobRow, "id" | "firedAt">;

/**
 * CRUD for scheduled jobs. `allActive()` is used by the scheduler at boot to
 * rebuild its timer heap.
 */
export interface JobStore {
  list(chatId: number): Promise<JobRow[]>;
  get(id: number): Promise<JobRow | null>;
  insert(row: NewJob): Promise<number>;
  update(id: number, patch: Partial<JobRow>): Promise<void>;
  delete(id: number): Promise<void>;
  stampFired(id: number, at: Date): Promise<void>;
  allActive(): Promise<JobRow[]>;
}

// Re-export Job for convenience.
export type { Job };
