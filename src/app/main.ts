import { buildTracerContainer } from "../composition/container.ts";

async function main(): Promise<void> {
  const container = buildTracerContainer({ env: process.env });

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
      // eslint-disable-next-line no-console
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
    // eslint-disable-next-line no-console
    console.log("[luna] dry-run mode: waiting for signal");
    // A long-lived interval keeps the loop alive; signal handlers call exit().
    const keepAlive = setInterval(() => {
      /* noop */
    }, 60_000);
    // On shutdown we clear this so exit() can run cleanly.
    process.once("exit", () => clearInterval(keepAlive));
    return;
  }

  await container.start();
  // eslint-disable-next-line no-console
  console.log("[luna] tracer up; polling Telegram");
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error("[luna] fatal:", err);
  process.exit(1);
});
