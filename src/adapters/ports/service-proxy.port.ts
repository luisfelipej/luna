/**
 * Arbitrary-service proxy — the backend for `POST /api/service/:name`.
 * Implementations must enforce the SSRF CIDR guard with DNS pinning.
 *
 * `pathSuffix` is only honoured if the matching ServiceDef has
 * `allow_path_suffix: true`. `body`/`params` are merged with the service's
 * static defaults from `services.yaml`.
 */
export interface ServiceProxyRequest {
  readonly body?: unknown;
  readonly params?: Readonly<Record<string, string>>;
  readonly pathSuffix?: string;
}

export interface ServiceProxyResponse {
  readonly status: number;
  readonly body: unknown;
}

export interface ServiceProxyPort {
  call(name: string, req: ServiceProxyRequest): Promise<ServiceProxyResponse>;
}
