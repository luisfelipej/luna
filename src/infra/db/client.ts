import { Database } from "bun:sqlite";
import { drizzle, type BunSQLiteDatabase } from "drizzle-orm/bun-sqlite";
import * as schema from "./schema.ts";

export interface LunaDb extends BunSQLiteDatabase<typeof schema> {
  $raw: Database;
}

/**
 * Open a SQLite database at `url` (pass `:memory:` for tests) and wire it to
 * Drizzle. Applies the production-critical pragmas once on open:
 *   - `journal_mode = WAL`   (concurrent readers + single writer)
 *   - `busy_timeout  = 5000` (5s wait on `SQLITE_BUSY`)
 *   - `foreign_keys  = ON`   (referential integrity for future cross-refs)
 *
 * Note: the design named `better-sqlite3`, but Bun's runtime (which Luna
 * targets exclusively) does not yet support native `.node` bindings for it
 * (see https://github.com/oven-sh/bun/issues/4290). `bun:sqlite` has the
 * same synchronous API surface we need and is drizzle-supported.
 *
 * `:memory:` does not benefit from WAL (per-connection); we still set it so
 * behavioural tests don't diverge — SQLite silently no-ops on memory DBs.
 */
export function openDb(url: string): LunaDb {
  const raw = new Database(url);
  raw.exec("PRAGMA journal_mode = WAL");
  raw.exec("PRAGMA busy_timeout = 5000");
  raw.exec("PRAGMA foreign_keys = ON");
  const drizzled = drizzle(raw, { schema });
  const db = Object.assign(drizzled, { $raw: raw }) as LunaDb;
  return db;
}

export { schema };
