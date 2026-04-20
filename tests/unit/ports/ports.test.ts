import { describe, expect, it } from "bun:test";
import type { AllowedWorkspaceStore } from "../../../src/adapters/ports/allowed-workspace-store.port.ts";
import type { ConfigResolverPort } from "../../../src/adapters/ports/config-resolver.port.ts";
import type { CrashRecoveryPort } from "../../../src/adapters/ports/crash-recovery.port.ts";
import type { FsPort } from "../../../src/adapters/ports/fs.port.ts";
import type { HistoryStore } from "../../../src/adapters/ports/history-store.port.ts";
import type { JobStore } from "../../../src/adapters/ports/job-store.port.ts";
import type { LockPort } from "../../../src/adapters/ports/lock.port.ts";
import type { SchedulerPort } from "../../../src/adapters/ports/scheduler.port.ts";
import type { ServiceProxyPort } from "../../../src/adapters/ports/service-proxy.port.ts";
import type { SessionStore } from "../../../src/adapters/ports/session-store.port.ts";
import type { SettingsStore } from "../../../src/adapters/ports/settings-store.port.ts";
import type { WebhookServerPort } from "../../../src/adapters/ports/webhook-server.port.ts";
import type { WorkspaceHistoryStore } from "../../../src/adapters/ports/workspace-history-store.port.ts";

describe("port interfaces compile and fakes are structurally assignable", () => {
  it("SessionStore", () => {
    const s: SessionStore = {
      async get() {
        return null;
      },
      async upsert() {},
      async clear() {},
      async addCost() {},
    };
    expect(typeof s.get).toBe("function");
  });

  it("JobStore", () => {
    const s: JobStore = {
      async list() {
        return [];
      },
      async get() {
        return null;
      },
      async insert() {
        return 1;
      },
      async update() {},
      async delete() {},
      async stampFired() {},
      async allActive() {
        return [];
      },
    };
    expect(typeof s.insert).toBe("function");
  });

  it("SettingsStore", () => {
    const s: SettingsStore = {
      async get() {
        return null;
      },
      async set() {},
      async delete() {},
      async listPrefix() {
        return [];
      },
    };
    expect(typeof s.listPrefix).toBe("function");
  });

  it("HistoryStore", () => {
    const s: HistoryStore = {
      async append() {},
      async tail() {
        return [];
      },
    };
    expect(typeof s.append).toBe("function");
  });

  it("AllowedWorkspaceStore", () => {
    const s: AllowedWorkspaceStore = {
      async list() {
        return [];
      },
      async has() {
        return false;
      },
      async add() {},
      async remove() {},
      async touch() {},
    };
    expect(typeof s.list).toBe("function");
  });

  it("WorkspaceHistoryStore", () => {
    const s: WorkspaceHistoryStore = {
      async getCurrent() {
        return null;
      },
      async setCurrent() {},
    };
    expect(typeof s.setCurrent).toBe("function");
  });

  it("SchedulerPort", () => {
    const s: SchedulerPort = {
      async start() {},
      async register() {},
      async unregister() {},
      async rehydrate() {},
      async stop() {},
    };
    expect(typeof s.start).toBe("function");
  });

  it("LockPort", () => {
    const s: LockPort = {
      async withLock(_id, fn) {
        return fn();
      },
      async tryWithLock(_id, fn) {
        return fn();
      },
    };
    expect(typeof s.withLock).toBe("function");
  });

  it("FsPort", () => {
    const s: FsPort = {
      async readFile() {
        return Buffer.from("");
      },
      async writeFile() {},
      async appendLine() {},
      async mkdirp() {},
      async realpath(p) {
        return p;
      },
      async exists() {
        return false;
      },
      async unlink() {},
      async listDir() {
        return [];
      },
    };
    expect(typeof s.realpath).toBe("function");
  });

  it("CrashRecoveryPort", () => {
    const s: CrashRecoveryPort = {
      async mark() {},
      async clear() {},
      async listPending() {
        return [];
      },
    };
    expect(typeof s.mark).toBe("function");
  });

  it("ConfigResolverPort", () => {
    const s: ConfigResolverPort = {
      resolve() {
        return { value: "sonnet", tier: 6 };
      },
    };
    expect(s.resolve(1, "/w", "model")?.tier).toBe(6);
  });

  it("WebhookServerPort", () => {
    const s: WebhookServerPort = {
      async start() {},
      async stop() {},
      status() {
        return { running: false, port: null, endpoints: [] };
      },
    };
    expect(typeof s.start).toBe("function");
    expect(s.status().running).toBe(false);
  });

  it("ServiceProxyPort", () => {
    const s: ServiceProxyPort = {
      async call() {
        return { status: 200, body: null };
      },
    };
    expect(typeof s.call).toBe("function");
  });
});
