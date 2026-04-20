import { z } from "zod";

/**
 * Shape of `config/users.yaml`. Maps telegram user ids to GitHub identity
 * and per-user backend overrides. Parsed at boot via YAML loader + zod.
 */
export const UsersYamlSchema = z.object({
  users: z.array(
    z.object({
      telegram_id: z.number().int(),
      github_login: z.string().optional(),
      role: z.enum(["admin", "user"]).default("user"),
      model: z.enum(["opus", "sonnet", "haiku"]).optional(),
      timeout_s: z.number().int().positive().optional(),
      budget_usd: z.number().nonnegative().optional(),
      context_window: z.number().int().positive().optional(),
    }),
  ),
});

export type UsersYaml = z.infer<typeof UsersYamlSchema>;
export type UserYamlEntry = UsersYaml["users"][number];
