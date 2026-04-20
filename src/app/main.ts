import { buildTracerContainer } from "../composition/container.ts";
import { buildFullAppContainer } from "../composition/full-app-container.ts";

/**
 * Boot the bot in either tracer mode (default until Phase 11 promotes full
 * mode) or full mode when `LUNA_MODE=full` is set. Both expose a common
 * `{ start, stop }` contract so signal handling is identical.
 */
async function main(): Promise<void> {
  const mode = (process.env.LUNA_MODE ?? "tracer").toLowerCase();
  const container =
    mode === "full"
      ? await buildFullAppContainer({ env: process.env })
      : buildTracerContainer({ env: process.env });

  // Dry-run: build the container + install signal handlers, but don't poll
  // Telegram. Used by tests that verify graceful shutdown without a real
  // bot token.
  const dryRun = process.env.LUNA_DRY_RUN === "1";

  let stopping = false;
  const shutdown = async (signal: string) => {
    if (stopping) return;
    stopping = true;
    try {
      await container.stop();
    } catch (err) {
      console.error(`[luna] error during shutdown on ${signal}:`, err);
      process.exit(1);
      return;
    }
    process.exit(0);
  };

  process.on("SIGINT", () => {
    void shutdown("SIGINT");
  });
  process.on("SIGTERM", () => {
    void shutdown("SIGTERM");
  });

  if (dryRun) {
    // keep the event loop alive until a signal arrives
    console.log(`[luna] dry-run mode (${mode}): waiting for signal`);
    // A long-lived interval keeps the loop alive; signal handlers call exit().
    const keepAlive = setInterval(() => {
      /* noop */
    }, 60_000);
    // On shutdown we clear this so exit() can run cleanly.
    process.once("exit", () => clearInterval(keepAlive));
    return;
  }

  await container.start();
  console.log(`[luna] ${mode} mode up; polling Telegram`);
}

main().catch((err) => {
  console.error("[luna] fatal:", err);
  process.exit(1);
});
