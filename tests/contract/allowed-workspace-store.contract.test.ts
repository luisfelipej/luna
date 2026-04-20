import { applyMigrations } from "../../scripts/migrate.ts";
import { openDb } from "../../src/infra/db/client.ts";
import { SqliteAllowedWorkspaceStore } from "../../src/infra/db/sqlite-allowed-workspace-store.ts";
import { SqliteWorkspaceHistoryStore } from "../../src/infra/db/sqlite-workspace-history-store.ts";
import { FakeAllowedWorkspaceStore } from "../helpers/fakes/fake-allowed-workspace-store.ts";
import { FakeWorkspaceHistoryStore } from "../helpers/fakes/fake-workspace-history-store.ts";
import { allowedWorkspaceStoreContract } from "./allowed-workspace-store.contract.ts";
import { workspaceHistoryStoreContract } from "./workspace-history-store.contract.ts";

allowedWorkspaceStoreContract("fake", () => new FakeAllowedWorkspaceStore());
allowedWorkspaceStoreContract("sqlite :memory:", async () => {
  const db = openDb(":memory:");
  await applyMigrations(db);
  return new SqliteAllowedWorkspaceStore(db);
});

workspaceHistoryStoreContract("fake", () => new FakeWorkspaceHistoryStore());
workspaceHistoryStoreContract("sqlite :memory:", async () => {
  const db = openDb(":memory:");
  await applyMigrations(db);
  return new SqliteWorkspaceHistoryStore(db);
});
