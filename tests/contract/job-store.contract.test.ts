import { applyMigrations } from "../../scripts/migrate.ts";
import { openDb } from "../../src/infra/db/client.ts";
import { SqliteJobStore } from "../../src/infra/db/sqlite-job-store.ts";
import { FakeJobStore } from "../helpers/fakes/fake-job-store.ts";
import { jobStoreContract } from "./job-store.contract.ts";

jobStoreContract("fake", () => new FakeJobStore());
jobStoreContract("sqlite :memory:", async () => {
  const db = openDb(":memory:");
  await applyMigrations(db);
  return new SqliteJobStore(db);
});
