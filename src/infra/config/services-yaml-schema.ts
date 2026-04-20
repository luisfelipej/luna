import { z } from "zod";

/**
 * Shape of `config/services.yaml`. Each service entry describes an upstream
 * endpoint that can be proxied through `POST /api/service/:name`.
 *
 * Service name must match `/^[a-z0-9_-]+$/` so it maps safely to a URL path.
 * `allow_internal: true` bypasses the SSRF CIDR guard — use with caution.
 */
export const ServicesYamlSchema = z.object({
  services: z.array(
    z.object({
      name: z.string().regex(/^[a-z0-9_-]+$/, "service name must be [a-z0-9_-]+"),
      url: z.string().url(),
      method: z.enum(["GET", "POST", "PUT", "DELETE", "PATCH"]),
      description: z.string().optional(),
      notes: z.string().optional(),
      auth: z.discriminatedUnion("mode", [
        z.object({ mode: z.literal("none") }),
        z.object({ mode: z.literal("bearer"), env: z.string().min(1) }),
        z.object({
          mode: z.literal("header"),
          env: z.string().min(1),
          header: z.string().min(1),
        }),
        z.object({
          mode: z.literal("query"),
          env: z.string().min(1),
          param: z.string().min(1),
        }),
      ]),
      headers: z.record(z.string()).optional(),
      params: z.record(z.string()).optional(),
      allow_path_suffix: z.boolean().default(false),
      allow_internal: z.boolean().default(false),
    }),
  ),
});

export type ServicesYaml = z.infer<typeof ServicesYamlSchema>;
export type ServiceYamlEntry = ServicesYaml["services"][number];
