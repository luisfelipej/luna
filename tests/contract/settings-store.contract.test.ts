import { applyMigrations } from "../../scripts/migrate.ts";
import { openDb } from "../../src/infra/db/client.ts";
import { SqliteSettingsStore } from "../../src/infra/db/sqlite-settings-store.ts";
import { FakeSettingsStore } from "../helpers/fakes/fake-settings-store.ts";
import { settingsStoreContract } from "./settings-store.contract.ts";

settingsStoreContract("fake", () => new FakeSettingsStore());
settingsStoreContract("sqlite :memory:", async () => {
  const db = openDb(":memory:");
  await applyMigrations(db);
  return new SqliteSettingsStore(db);
});
