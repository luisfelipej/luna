/**
 * Runtime-shape of a single entry in `config/services.yaml`. Mirrors the
 * output type of `ServicesYamlSchema` (zod) but as a pure entity with zero
 * framework deps.
 */
export type ServiceAuth =
  | { readonly mode: "none" }
  | { readonly mode: "bearer"; readonly env: string }
  | { readonly mode: "header"; readonly env: string; readonly header: string }
  | { readonly mode: "query"; readonly env: string; readonly param: string };

export type ServiceMethod = "GET" | "POST" | "PUT" | "DELETE" | "PATCH";

export interface ServiceDef {
  readonly name: string;
  readonly url: string;
  readonly method: ServiceMethod;
  readonly description?: string;
  readonly notes?: string;
  readonly auth: ServiceAuth;
  readonly headers?: Readonly<Record<string, string>>;
  readonly params?: Readonly<Record<string, string>>;
  readonly allowPathSuffix: boolean;
  readonly allowInternal: boolean;
}
