import { z } from "zod";

/**
 * Shape of `config/workspaces.yaml`. Declares known workspace paths with
 * optional per-workspace system prompt and backend overrides (claude.*).
 */
export const WorkspacesYamlSchema = z.object({
  workspaces: z.array(
    z.object({
      path: z.string().min(1),
      system_prompt: z.string().optional(),
      claude: z
        .object({
          model: z.enum(["opus", "sonnet", "haiku"]).optional(),
          timeout_s: z.number().int().positive().optional(),
          budget_usd: z.number().nonnegative().optional(),
          context_window: z.number().int().positive().optional(),
        })
        .optional(),
    }),
  ),
});

export type WorkspacesYaml = z.infer<typeof WorkspacesYamlSchema>;
export type WorkspaceYamlEntry = WorkspacesYaml["workspaces"][number];
