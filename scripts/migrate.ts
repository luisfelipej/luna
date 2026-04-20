/**
 * Transactional migration runner. Reads every `.sql` file under `migrations/`
 * in lexicographic order and applies any not yet recorded in the
 * `_migrations` bookkeeping table. Each migration runs inside its own
 * SQLite transaction so a partial failure leaves the DB untouched.
 *
 * The runner is idempotent: a second invocation against an up-to-date DB is
 * a no-op (each applied file's name is recorded and skipped next time).
 *
 * Invoked both by `bun run migrate` at boot and by the contract tests that
 * need a migrated `:memory:` DB.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { openDb, type LunaDb } from "../src/infra/db/client.ts";

const MIGRATIONS_DIR = join(import.meta.dir, "..", "migrations");

interface AppliedRow {
  name: string;
}

export async function applyMigrations(db: LunaDb, dir: string = MIGRATIONS_DIR): Promise<string[]> {
  const raw = db.$raw;
  raw.exec(`CREATE TABLE IF NOT EXISTS _migrations (
    name TEXT PRIMARY KEY,
    applied_at TEXT NOT NULL
  )`);

  const files = readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  const appliedRows = raw.prepare("SELECT name FROM _migrations").all() as AppliedRow[];
  const applied = new Set(appliedRows.map((r) => r.name));
  const newlyApplied: string[] = [];

  const record = raw.prepare("INSERT INTO _migrations(name, applied_at) VALUES (?, ?)");

  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = readFileSync(join(dir, file), "utf8");
    const tx = raw.transaction(() => {
      raw.exec(sql);
      record.run(file, new Date().toISOString());
    });
    tx();
    newlyApplied.push(file);
  }

  return newlyApplied;
}

async function main(): Promise<void> {
  const dataDir = process.env.DATA_DIR ?? ".";
  const dbPath = process.env.LUNA_DB_URL ?? join(dataDir, "luna.db");
  const db = openDb(dbPath);
  const applied = await applyMigrations(db);
  // eslint-disable-next-line no-console
  console.log(
    applied.length === 0
      ? `[luna:migrate] up-to-date (${dbPath})`
      : `[luna:migrate] applied: ${applied.join(", ")}`,
  );
  db.$raw.close();
}

if (import.meta.main) {
  await main();
}
