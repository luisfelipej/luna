import { applyMigrations } from "../../scripts/migrate.ts";
import { openDb } from "../../src/infra/db/client.ts";
import { SqliteSessionStore } from "../../src/infra/db/sqlite-session-store.ts";
import { FakeSessionStore } from "../helpers/fakes/fake-session-store.ts";
import { sessionStoreContract } from "./session-store.contract.ts";

sessionStoreContract("fake", () => new FakeSessionStore());
sessionStoreContract("sqlite :memory:", async () => {
  const db = openDb(":memory:");
  await applyMigrations(db);
  return new SqliteSessionStore(db);
});
