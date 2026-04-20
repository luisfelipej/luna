/**
 * Placeholder drizzle-kit config. Phase 3 will wire the real schema + dialect.
 * We keep this file in place now so `drizzle-kit` commands and the npm
 * `migrate` script resolve before Phase 3 lands.
 */
import type { Config } from "drizzle-kit";

export default {
  dialect: "sqlite",
  schema: "./src/infra/db/schema.ts",
  out: "./migrations",
} satisfies Config;
