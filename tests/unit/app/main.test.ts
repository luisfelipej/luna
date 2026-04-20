import { describe, expect, it } from "bun:test";
import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "../../..");
const mainScript = resolve(repoRoot, "src/app/main.ts");

/**
 * Spawn main.ts as a child; after it's up, send SIGTERM; assert clean exit.
 * We provide a sentinel env LUNA_DRY_RUN=1 so main.ts builds the container
 * but does NOT start polling Telegram — that would try to hit the real API.
 */
describe("app/main.ts", () => {
  it("exits cleanly on SIGTERM", async () => {
    const child = spawn("bun", ["run", mainScript], {
      cwd: repoRoot,
      env: {
        ...process.env,
        TELEGRAM_BOT_TOKEN: "fake-token",
        TELEGRAM_ALLOWED_IDS: "42",
        LUNA_DRY_RUN: "1",
        LOG_LEVEL: "error",
      },
      stdio: ["ignore", "pipe", "pipe"],
    });

    // wait briefly for boot
    await delay(500);
    expect(child.exitCode).toBeNull();

    child.kill("SIGTERM");

    const exitCode = await new Promise<number | null>((resolveP) => {
      const timer = setTimeout(() => {
        child.kill("SIGKILL");
        resolveP(null);
      }, 3000);
      child.on("exit", (code) => {
        clearTimeout(timer);
        resolveP(code);
      });
    });

    expect(exitCode).toBe(0);
  }, 10000);
});
