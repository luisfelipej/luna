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

describe("buildFullAppContainer wires the HTTP server", () => {
  it("exposes webhookServer; presenter /webhooks shows wired endpoints", async () => {
    const dataDir = tmp("luna-http-");
    const transport = new FakeTelegramTransport();
    const spawn = new FakeSpawn();
    const container = await buildFullAppContainer({
      env: {
        TELEGRAM_BOT_TOKEN: "t",
        TELEGRAM_ALLOWED_IDS: "42",
        WORKSPACE_BASE: dataDir,
        DATA_DIR: dataDir,
        LOG_LEVEL: "warn",
        GITHUB_WEBHOOK_SECRET: "gh",
        GENERIC_WEBHOOK_SECRET: "gen",
      },
      dbUrl: ":memory:",
      transportOverride: transport,
      spawnOverride: spawn.spawn,
      usersYamlPath: null,
      workspacesYamlPath: null,
      startHttpServer: false,
    });

    // Presenter /webhooks now consults the live HonoWebhookServer status,
    // which should list both endpoints as enabled.
    await transport.deliver({
      chatId: 42,
      fromId: 42,
      messageId: 1,
      text: "/webhooks",
      dateMs: 1,
    });
    const reply = transport.sent.at(-1)?.text ?? "";
    expect(reply).toContain("/webhook/github");
    expect(reply).toContain("/webhook");
    expect(reply).toContain("enabled");

    expect(container.webhookServer.status().running).toBe(false);
    await container.stop();
  });

  it("HTTP server starts on an ephemeral port and /health responds", async () => {
    const dataDir = tmp("luna-http-live-");
    const transport = new FakeTelegramTransport();
    const spawn = new FakeSpawn();
    const container = await buildFullAppContainer({
      env: {
        TELEGRAM_BOT_TOKEN: "t",
        TELEGRAM_ALLOWED_IDS: "42",
        WORKSPACE_BASE: dataDir,
        DATA_DIR: dataDir,
        LOG_LEVEL: "warn",
        HTTP_PORT: "0", // ephemeral
      },
      dbUrl: ":memory:",
      transportOverride: transport,
      spawnOverride: spawn.spawn,
      usersYamlPath: null,
      workspacesYamlPath: null,
      // startHttpServer default = true
    });

    await container.start();
    const { port, running } = container.webhookServer.status();
    expect(running).toBe(true);
    expect(typeof port).toBe("number");
    const r = await fetch(`http://127.0.0.1:${port}/health`);
    expect(r.status).toBe(200);

    await container.stop();
    expect(container.webhookServer.status().running).toBe(false);
  });
});
