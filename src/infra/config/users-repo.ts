import { readFileSync } from "node:fs";
import { parse as parseYaml } from "yaml";
import { ConfigError } from "../../entities/errors.ts";
import { UsersYamlSchema, type UserYamlEntry, type UsersYaml } from "./users-yaml-schema.ts";

/**
 * YAML-backed reader for `config/users.yaml`. The contents are loaded + zod-
 * validated once at construction; `byTelegramId` returns the cached entry.
 *
 * Malformed YAML or schema violations throw `ConfigError` at construction
 * (before any request is served) — boot-fast, boot-certain.
 */
export class UsersRepo {
  private readonly byId = new Map<number, UserYamlEntry>();
  readonly users: readonly UserYamlEntry[];

  constructor(rawYaml: string) {
    const parsed = this.safeParse(rawYaml);
    this.users = parsed.users;
    for (const u of parsed.users) this.byId.set(u.telegram_id, u);
  }

  static fromFile(path: string): UsersRepo {
    try {
      return new UsersRepo(readFileSync(path, "utf8"));
    } catch (cause) {
      if (cause instanceof ConfigError) throw cause;
      throw new ConfigError(`failed to read users.yaml at ${path}`, cause as Error);
    }
  }

  byTelegramId(id: number): UserYamlEntry | undefined {
    return this.byId.get(id);
  }

  private safeParse(raw: string): UsersYaml {
    let doc: unknown;
    try {
      doc = parseYaml(raw);
    } catch (cause) {
      throw new ConfigError("users.yaml is not valid YAML", cause as Error);
    }
    const res = UsersYamlSchema.safeParse(doc);
    if (!res.success) {
      const summary = res.error.issues
        .map((i) => `${i.path.join(".") || "<root>"}: ${i.message}`)
        .join("; ");
      throw new ConfigError(`users.yaml schema: ${summary}`, res.error);
    }
    return res.data;
  }
}
