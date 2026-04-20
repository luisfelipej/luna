import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  buildFullAppContainer,
  type FullAppContainer,
} from "../../src/composition/full-app-container.ts";
import { FakeAgentBackend } from "../helpers/fakes/fake-agent-backend.ts";
import { FakeSpawn } from "../helpers/fakes/fake-spawn.ts";
import { FakeTelegramTransport } from "../helpers/fakes/fake-telegram-transport.ts";
import type { StreamChunk } from "../../src/entities/stream-chunk.ts";

export interface Harness {
  readonly container: FullAppContainer;
  readonly transport: FakeTelegramTransport;
  readonly spawn: FakeSpawn;
  readonly agent: FakeAgentBackend;
  readonly dataDir: string;
  readonly httpPort: number;
  readonly adminChatId: number;
  readonly githubSecret: string;
  readonly apiSecret: string;
  stop(): Promise<void>;
}

export interface HarnessOptions {
  readonly startHttp?: boolean;
  readonly githubSecret?: string;
  readonly apiSecret?: string;
  readonly adminChatId?: number;
  /** Stream chunks the FakeAgentBackend will emit for every `send`. */
  readonly agentScript?: readonly StreamChunk[];
}

/**
 * Spin up a real-ish Luna environment for integration tests:
 *   - Real Drizzle SQLite (shared :memory: fails in bun:sqlite — use file)
 *   - Real HonoWebhookServer on an ephemeral port (opt-in)
 *   - FakeAgentBackend via FakeSpawn (deterministic stream-json stdin/stdout)
 *   - FakeTelegramTransport capturing outgoing send/edit/file calls
 *   - Scheduler armed on container.start()
 */
export async function buildHarness(opts: HarnessOptions = {}): Promise<Harness> {
  const dataDir = mkdtempSync(join(tmpdir(), "luna-integ-"));
  const transport = new FakeTelegramTransport();
  const spawn = new FakeSpawn();
  const agent = new FakeAgentBackend(
    opts.agentScript ? { script: opts.agentScript } : {},
  );
  const adminChatId = opts.adminChatId ?? 42;
  const githubSecret = opts.githubSecret ?? "gh-secret";
  const apiSecret = opts.apiSecret ?? "api-secret";
  const startHttp = opts.startHttp ?? true;
  const httpPort = 0; // ask Bun for an ephemeral port

  const container = await buildFullAppContainer({
    env: {
      TELEGRAM_BOT_TOKEN: "t",
      TELEGRAM_ALLOWED_IDS: String(adminChatId),
      WORKSPACE_BASE: dataDir,
      DATA_DIR: dataDir,
      LOG_LEVEL: "warn",
      GITHUB_WEBHOOK_SECRET: githubSecret,
      GENERIC_WEBHOOK_SECRET: apiSecret,
      HTTP_PORT: String(httpPort),
    },
    dbUrl: join(dataDir, "luna.db"),
    transportOverride: transport,
    spawnOverride: spawn.spawn,
    agentBackendOverride: agent,
    usersYamlPath: null,
    workspacesYamlPath: null,
    servicesYamlPath: null,
    startHttpServer: startHttp,
  });

  await container.start();
  const actualPort = container.webhookServer.status().port ?? 0;

  return {
    container,
    transport,
    spawn,
    agent,
    dataDir,
    httpPort: actualPort,
    adminChatId,
    githubSecret,
    apiSecret,
    async stop() {
      await container.stop();
    },
  };
}
