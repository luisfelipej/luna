import { readFileSync } from "node:fs";
import { parse as parseYaml } from "yaml";
import { ConfigError } from "../../entities/errors.ts";
import {
  WorkspacesYamlSchema,
  type WorkspaceYamlEntry,
  type WorkspacesYaml,
} from "./workspaces-yaml-schema.ts";

/**
 * YAML-backed reader for `config/workspaces.yaml`. Validated once at
 * construction; `byPath` returns the cached entry for a given workspace.
 */
export class WorkspacesRepo {
  private readonly byPathMap = new Map<string, WorkspaceYamlEntry>();
  readonly workspaces: readonly WorkspaceYamlEntry[];

  constructor(rawYaml: string) {
    const parsed = this.safeParse(rawYaml);
    this.workspaces = parsed.workspaces;
    for (const w of parsed.workspaces) this.byPathMap.set(w.path, w);
  }

  static fromFile(path: string): WorkspacesRepo {
    try {
      return new WorkspacesRepo(readFileSync(path, "utf8"));
    } catch (cause) {
      if (cause instanceof ConfigError) throw cause;
      throw new ConfigError(`failed to read workspaces.yaml at ${path}`, cause as Error);
    }
  }

  byPath(path: string): WorkspaceYamlEntry | undefined {
    return this.byPathMap.get(path);
  }

  private safeParse(raw: string): WorkspacesYaml {
    let doc: unknown;
    try {
      doc = parseYaml(raw);
    } catch (cause) {
      throw new ConfigError("workspaces.yaml is not valid YAML", cause as Error);
    }
    const res = WorkspacesYamlSchema.safeParse(doc);
    if (!res.success) {
      const summary = res.error.issues
        .map((i) => `${i.path.join(".") || "<root>"}: ${i.message}`)
        .join("; ");
      throw new ConfigError(`workspaces.yaml schema: ${summary}`, res.error);
    }
    return res.data;
  }
}
