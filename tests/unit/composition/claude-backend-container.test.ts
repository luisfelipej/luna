import { describe, expect, it } from "bun:test";
import {
  buildClaudeAgentBackend,
  StreamAbortRegistry,
} from "../../../src/composition/claude-backend-container.ts";
import { openDb } from "../../../src/infra/db/client.ts";
import { SqliteAllowedWorkspaceStore } from "../../../src/infra/db/sqlite-allowed-workspace-store.ts";
import { SqliteJobStore } from "../../../src/infra/db/sqlite-job-store.ts";
import { SqliteSessionStore } from "../../../src/infra/db/sqlite-session-store.ts";
import { SqliteSettingsStore } from "../../../src/infra/db/sqlite-settings-store.ts";
import { SqliteWorkspaceHistoryStore } from "../../../src/infra/db/sqlite-workspace-history-store.ts";
import { JsonlHistoryStore } from "../../../src/infra/fs/jsonl-history-store.ts";
import { AsyncMutexLockPort } from "../../../src/infra/locks/async-mutex-lock-port.ts";
import { applyMigrations } from "../../../scripts/migrate.ts";
import { MemFsPort } from "../../helpers/fakes/mem-fs-port.ts";
import { FakeSpawn } from "../../helpers/fakes/fake-spawn.ts";
import { VirtualClock } from "../../helpers/virtual-clock.ts";

function buildStores() {
  const db = openDb(":memory:");
  applyMigrations(db);
  const fs = new MemFsPort();
  const clock = new VirtualClock(1);
  return {
    db,
    sessionStore: new SqliteSessionStore(db),
    jobStore: new SqliteJobStore(db),
    settingsStore: new SqliteSettingsStore(db),
    allowedWorkspaceStore: new SqliteAllowedWorkspaceStore(db),
    workspaceHistoryStore: new SqliteWorkspaceHistoryStore(db),
    historyStore: new JsonlHistoryStore(fs, clock, "/history"),
    lock: new AsyncMutexLockPort(),
    close() {
      db.$raw.close();
    },
  };
}

describe("buildClaudeAgentBackend", () => {
  it("returns wiring with backend, pool, crashRecovery, aborts, tick, shutdown", () => {
    const clock = new VirtualClock(1_000);
    const stores = buildStores();
    const fakeSpawn = new FakeSpawn();
    const resolver = {
      resolve: () => ({ value: "sonnet", tier: 6 as const }),
    };
    const container = buildClaudeAgentBackend({
      stores,
      resolver,
      clock,
      dataDir: "/data",
      spawn: fakeSpawn.spawn,
    });
    expect(container.backend).toBeDefined();
    expect(container.pool).toBeDefined();
    expect(container.crashRecovery).toBeDefined();
    expect(container.aborts).toBeInstanceOf(StreamAbortRegistry);
    expect(typeof container.tick).toBe("function");
    stores.close();
  });
});

describe("StreamAbortRegistry", () => {
  it("register returns an AbortController; abort(chatId) cancels + removes", () => {
    const reg = new StreamAbortRegistry();
    const ctrl = reg.register(7);
    expect(ctrl.signal.aborted).toBe(false);
    expect(reg.has(7)).toBe(true);
    expect(reg.abort(7)).toBe(true);
    expect(ctrl.signal.aborted).toBe(true);
    expect(reg.has(7)).toBe(false);
  });

  it("abort() on an unknown chat returns false", () => {
    const reg = new StreamAbortRegistry();
    expect(reg.abort(999)).toBe(false);
  });

  it("clear() removes without aborting", () => {
    const reg = new StreamAbortRegistry();
    const ctrl = reg.register(1);
    reg.clear(1);
    expect(ctrl.signal.aborted).toBe(false);
    expect(reg.has(1)).toBe(false);
  });
});
