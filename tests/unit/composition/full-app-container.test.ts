import { describe, expect, it } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FakeSpawn } from "../../helpers/fakes/fake-spawn.ts";
import { FakeTelegramTransport } from "../../helpers/fakes/fake-telegram-transport.ts";
import { buildFullAppContainer } from "../../../src/composition/full-app-container.ts";

function tmp(prefix: string): string {
  return mkdtempSync(join(tmpdir(), prefix));
}

describe("buildFullAppContainer", () => {
  it("wires transport + presenter + stores + backend + restore + shutdown", async () => {
    const dataDir = tmp("luna-full-");
    const transport = new FakeTelegramTransport();
    const spawn = new FakeSpawn();
    const container = await buildFullAppContainer({
      env: {
        TELEGRAM_BOT_TOKEN: "t",
        TELEGRAM_ALLOWED_IDS: "42",
        WORKSPACE_BASE: dataDir,
        DATA_DIR: dataDir,
        LOG_LEVEL: "warn",
      },
      dbUrl: ":memory:",
      transportOverride: transport,
      spawnOverride: spawn.spawn,
      usersYamlPath: null,
      workspacesYamlPath: null,
    });

    expect(typeof container.start).toBe("function");
    expect(typeof container.stop).toBe("function");

    await container.start();

    // Drive a /new command through the transport; presenter replies.
    await transport.deliver({ chatId: 42, fromId: 42, messageId: 1, text: "/new", dateMs: 1 });
    expect(transport.sent.at(-1)?.text.toLowerCase()).toContain("new session");

    // Drive an /unknown command.
    await transport.deliver({
      chatId: 42,
      fromId: 42,
      messageId: 2,
      text: "/teleport",
      dateMs: 2,
    });
    expect(transport.sent.at(-1)?.text.toLowerCase()).toContain("unknown command");

    await container.stop();
  });

  it("runs RestoreOnStart — notifies chats with pending crash flags", async () => {
    const dataDir = tmp("luna-full-restore-");
    // Pre-seed a crash flag.
    const { mkdirSync, writeFileSync } = await import("node:fs");
    mkdirSync(join(dataDir, "crash"), { recursive: true });
    writeFileSync(join(dataDir, "crash", "42.flag"), "");

    const transport = new FakeTelegramTransport();
    const spawn = new FakeSpawn();
    const container = await buildFullAppContainer({
      env: {
        TELEGRAM_BOT_TOKEN: "t",
        TELEGRAM_ALLOWED_IDS: "42",
        WORKSPACE_BASE: dataDir,
        DATA_DIR: dataDir,
        LOG_LEVEL: "warn",
      },
      dbUrl: ":memory:",
      transportOverride: transport,
      spawnOverride: spawn.spawn,
      usersYamlPath: null,
      workspacesYamlPath: null,
    });
    await container.start();
    expect(transport.sent.some((s) => /interrupted/i.test(s.text))).toBe(true);
    await container.stop();
  });
});
