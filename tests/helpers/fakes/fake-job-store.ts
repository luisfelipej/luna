import type { JobRow, JobStore, NewJob } from "../../../src/adapters/ports/job-store.port.ts";

export class FakeJobStore implements JobStore {
  private readonly rows = new Map<number, JobRow>();
  private seq = 0;

  async list(chatId: number): Promise<JobRow[]> {
    return [...this.rows.values()].filter((j) => j.chatId === chatId);
  }
  async get(id: number): Promise<JobRow | null> {
    return this.rows.get(id) ?? null;
  }
  async insert(row: NewJob): Promise<number> {
    this.seq += 1;
    this.rows.set(this.seq, { ...row, id: this.seq, firedAt: null });
    return this.seq;
  }
  async update(id: number, patch: Partial<JobRow>): Promise<void> {
    const row = this.rows.get(id);
    if (!row) return;
    this.rows.set(id, { ...row, ...patch, id });
  }
  async delete(id: number): Promise<void> {
    this.rows.delete(id);
  }
  async stampFired(id: number, at: Date): Promise<void> {
    const row = this.rows.get(id);
    if (!row) return;
    this.rows.set(id, { ...row, firedAt: at });
  }
  async allActive(): Promise<JobRow[]> {
    return [...this.rows.values()].filter((j) => j.active);
  }
}
