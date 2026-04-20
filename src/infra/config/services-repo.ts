import { readFileSync } from "node:fs";
import { parse as parseYaml } from "yaml";
import { ConfigError } from "../../entities/errors.ts";
import {
  ServicesYamlSchema,
  type ServiceYamlEntry,
  type ServicesYaml,
} from "./services-yaml-schema.ts";

/**
 * YAML-backed reader for `config/services.yaml`. Contents are loaded + zod-
 * validated once at construction; `byName` returns the cached entry.
 *
 * Malformed YAML or schema violations throw `ConfigError` at construction —
 * boot-fast, boot-certain (mirrors UsersRepo / WorkspacesRepo).
 */
export class ServicesRepo {
  readonly services: readonly ServiceYamlEntry[];
  private readonly byNameMap = new Map<string, ServiceYamlEntry>();

  constructor(rawYaml: string) {
    const parsed = this.safeParse(rawYaml);
    this.services = parsed.services;
    for (const s of parsed.services) this.byNameMap.set(s.name, s);
  }

  static fromFile(path: string): ServicesRepo {
    try {
      return new ServicesRepo(readFileSync(path, "utf8"));
    } catch (cause) {
      if (cause instanceof ConfigError) throw cause;
      throw new ConfigError(`failed to read services.yaml at ${path}`, cause as Error);
    }
  }

  byName(name: string): ServiceYamlEntry | undefined {
    return this.byNameMap.get(name);
  }

  private safeParse(raw: string): ServicesYaml {
    let doc: unknown;
    try {
      doc = parseYaml(raw);
    } catch (cause) {
      throw new ConfigError("services.yaml is not valid YAML", cause as Error);
    }
    const res = ServicesYamlSchema.safeParse(doc);
    if (!res.success) {
      const summary = res.error.issues
        .map((i) => `${i.path.join(".") || "<root>"}: ${i.message}`)
        .join("; ");
      throw new ConfigError(`services.yaml schema: ${summary}`, res.error);
    }
    return res.data;
  }
}
