import { z } from "zod";

/**
 * Phase-0 tracer env schema. Only the knobs the tracer actually uses.
 * The full schema (WORKSPACE_BASE, DATA_DIR, HTTP_PORT, …) arrives in Phase 1.
 */
export const TracerEnvSchema = z.object({
  TELEGRAM_BOT_TOKEN: z.string().min(1, "TELEGRAM_BOT_TOKEN is required"),
  TELEGRAM_ALLOWED_IDS: z
    .string()
    .default("")
    .transform((s) =>
      s
        .split(",")
        .map((p) => p.trim())
        .filter((p) => p.length > 0)
        .map((p) => {
          const n = Number(p);
          if (!Number.isInteger(n)) throw new Error(`invalid id: ${p}`);
          return n;
        }),
    ),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
});

export type TracerEnv = z.infer<typeof TracerEnvSchema>;
