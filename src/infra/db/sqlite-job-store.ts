import type { JobRow, JobStore, NewJob } from "../../adapters/ports/job-store.port.ts";
import type { JobType, Schedule } from "../../entities/job.ts";
import type { LunaDb } from "./client.ts";

interface Row {
  id: number;
  chat_id: number;
  name: string;
  job_type: JobType;
  prompt: string;
  schedule_data: string;
  active: number;
  auto_remove: number;
  fired_at: string | null;
  created_at: string;
}

/**
 * SQLite-backed JobStore. The `schedule` discriminated union is persisted as
 * a JSON string in `schedule_data`; Job rows flow through `toPort()` which
 * parses + revives the Date fields.
 */
export class SqliteJobStore implements JobStore {
  constructor(private readonly db: LunaDb) {}

  async list(chatId: number): Promise<JobRow[]> {
    const rows = this.db.$raw
      .prepare("SELECT * FROM jobs WHERE chat_id = ? ORDER BY id")
      .all(chatId) as Row[];
    return rows.map((r) => this.toPort(r));
  }

  async get(id: number): Promise<JobRow | null> {
    const row = this.db.$raw.prepare("SELECT * FROM jobs WHERE id = ?").get(id) as Row | undefined;
    return row ? this.toPort(row) : null;
  }

  async insert(row: NewJob): Promise<number> {
    const res = this.db.$raw
      .prepare(
        `INSERT INTO jobs (chat_id, name, job_type, prompt, schedule_data,
           active, auto_remove, fired_at, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?)`,
      )
      .run(
        row.chatId,
        row.name,
        row.jobType,
        row.prompt,
        JSON.stringify(row.schedule),
        row.active ? 1 : 0,
        row.autoRemove ? 1 : 0,
        row.createdAt.toISOString(),
      );
    return Number(res.lastInsertRowid);
  }

  async update(id: number, patch: Partial<JobRow>): Promise<void> {
    const fields: string[] = [];
    const values: Array<string | number | null> = [];
    if (patch.chatId !== undefined) {
      fields.push("chat_id = ?");
      values.push(patch.chatId);
    }
    if (patch.name !== undefined) {
      fields.push("name = ?");
      values.push(patch.name);
    }
    if (patch.jobType !== undefined) {
      fields.push("job_type = ?");
      values.push(patch.jobType);
    }
    if (patch.prompt !== undefined) {
      fields.push("prompt = ?");
      values.push(patch.prompt);
    }
    if (patch.schedule !== undefined) {
      fields.push("schedule_data = ?");
      values.push(JSON.stringify(patch.schedule));
    }
    if (patch.active !== undefined) {
      fields.push("active = ?");
      values.push(patch.active ? 1 : 0);
    }
    if (patch.autoRemove !== undefined) {
      fields.push("auto_remove = ?");
      values.push(patch.autoRemove ? 1 : 0);
    }
    if (patch.firedAt !== undefined) {
      fields.push("fired_at = ?");
      values.push(patch.firedAt === null ? null : patch.firedAt.toISOString());
    }
    if (fields.length === 0) return;
    values.push(id);
    this.db.$raw.prepare(`UPDATE jobs SET ${fields.join(", ")} WHERE id = ?`).run(...values);
  }

  async delete(id: number): Promise<void> {
    this.db.$raw.prepare("DELETE FROM jobs WHERE id = ?").run(id);
  }

  async stampFired(id: number, at: Date): Promise<void> {
    this.db.$raw.prepare("UPDATE jobs SET fired_at = ? WHERE id = ?").run(at.toISOString(), id);
  }

  async allActive(): Promise<JobRow[]> {
    const rows = this.db.$raw
      .prepare("SELECT * FROM jobs WHERE active = 1 ORDER BY id")
      .all() as Row[];
    return rows.map((r) => this.toPort(r));
  }

  private toPort(r: Row): JobRow {
    return {
      id: r.id,
      chatId: r.chat_id,
      name: r.name,
      jobType: r.job_type,
      prompt: r.prompt,
      schedule: JSON.parse(r.schedule_data) as Schedule,
      active: r.active !== 0,
      autoRemove: r.auto_remove !== 0,
      firedAt: r.fired_at ? new Date(r.fired_at) : null,
      createdAt: new Date(r.created_at),
    };
  }
}
