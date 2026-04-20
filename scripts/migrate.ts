/**
 * DB migration runner. Phase 1 ships a stub — Phase 3 replaces it with a
 * drizzle-migrate invocation inside a transaction.
 */

async function main(): Promise<void> {
  // eslint-disable-next-line no-console
  console.log("[luna:migrate] Phase 1 stub — no migrations yet (Phase 3 wires this).");
}

await main();
