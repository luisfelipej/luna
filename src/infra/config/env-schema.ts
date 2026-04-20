import { z } from "zod";
import { ConfigError } from "../../entities/errors.ts";

const ALLOWED_IDS_RX = /^\s*(\d+\s*(,\s*\d+\s*)*)?$/;

/**
 * Full Luna env schema.
 *
 * Parsed at boot in `composition/config.ts`. Any validation error is fatal
 * (`process.exit(1)`) — missing / misspelled config is the primary cause of
 * production surprises. Only the `claude` CLI absence is a soft warn.
 */
export const EnvSchema = z.object({
  TELEGRAM_BOT_TOKEN: z.string().min(1, "TELEGRAM_BOT_TOKEN is required"),
  TELEGRAM_ALLOWED_IDS: z
    .string()
    .default("")
    .refine((s) => ALLOWED_IDS_RX.test(s), {
      message: "TELEGRAM_ALLOWED_IDS must be comma-separated integers",
    })
    .transform((s) =>
      s
        .split(",")
        .map((p) => p.trim())
        .filter((p) => p.length > 0)
        .map((p) => Number(p)),
    ),
  WORKSPACE_BASE: z.string().min(1, "WORKSPACE_BASE is required"),
  DATA_DIR: z.string().min(1, "DATA_DIR is required"),

  GITHUB_WEBHOOK_SECRET: z.string().optional(),
  GENERIC_WEBHOOK_SECRET: z.string().optional(),
  PUBLIC_URL: z.string().url().optional(),

  HTTP_PORT: z.coerce.number().int().positive().default(8080),

  LUNA_MODEL: z.enum(["opus", "sonnet", "haiku"]).optional(),
  LUNA_TIMEOUT_S: z.coerce.number().int().positive().optional(),
  LUNA_BUDGET_USD: z.coerce.number().nonnegative().optional(),
  LUNA_CONTEXT_WINDOW: z.coerce.number().int().positive().optional(),

  IDLE_TIMEOUT_MIN: z.coerce.number().int().positive().default(15),

  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
});

export type Env = z.infer<typeof EnvSchema>;

/**
 * Parse the given raw env (usually `process.env`) into a typed `Env`. Any
 * zod error is rethrown as a `ConfigError` with the formatted issue list.
 */
export function loadEnv(raw: Record<string, string | undefined>): Env {
  const result = EnvSchema.safeParse(raw);
  if (!result.success) {
    const summary = result.error.issues
      .map((i) => `${i.path.join(".") || "<root>"}: ${i.message}`)
      .join("; ");
    throw new ConfigError(`invalid env: ${summary}`, result.error);
  }
  return result.data;
}
