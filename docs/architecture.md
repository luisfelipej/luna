# Luna Architecture

This document is the reference for how Luna is layered, where to plug into it, and what each port does. Pair it with the README for context and with the Engram spec/design artifacts (`sdd/luna/design`, `sdd/luna/spec/*`) for the "why".

## The Layers

Luna follows Uncle Bob's Clean Architecture dependency rule: source files in an outer ring may import from inner rings, never the other way around. The rule is enforced at lint-time by `eslint-plugin-boundaries` (see `eslint.config.js`). Planting a bad import fails CI — see `scripts/check-boundaries.sh`.

```
  Inner ← ← ← ← ← ← ← ← ← ← ← ← ← ← ← ← ← Outer
+----------+   +-----------+   +-----------+   +-----------+   +---------------+   +-----+
| entities | ← | adapters/ | ← | usecases  | ← |  infra    | ← |  composition  | ← | app |
|  (pure)  |   |   ports   |   |  (pure)   |   | (concrete)|   | (DI wiring)   |   |     |
+----------+   +-----------+   +-----------+   +-----------+   +---------------+   +-----+
```

- **entities/**: pure TypeScript types — `User`, `Workspace`, `Session`, `Job`, `Message`, `WebhookEvent`, `ServiceDef`, `StreamChunk`, `BackendConfig`, plus the `LunaError` hierarchy. Zero framework imports.
- **adapters/ports/**: 16 interface declarations only. Every infra adapter implements one; every usecase depends on one.
- **usecases/**: pure application logic — given a set of ports, orchestrate a feature. No timers, no sockets, no filesystem. Deterministic modulo injected clocks.
- **infra/**: concrete adapters. `ClaudeCodeBackend` knows about `child_process`; `SqliteSessionStore` knows about Drizzle; `GrammyTelegramTransport` knows about grammY. Never imports from `usecases/`.
- **composition/**: DI root. Constructs concrete adapters, threads them through usecases, returns a `FullAppContainer` with `start/stop`. Also hosts the HTTP server (`HonoWebhookServer`) and the scheduler (`LoopScheduler`) because both need pure-fn usecases they'd otherwise violate the boundary by importing from infra.
- **app/**: process entrypoint. Reads env, calls `buildFullAppContainer`, installs signal handlers.

## Port Catalogue

Every interface lives under `src/adapters/ports/`. One port per capability.

| Port | Purpose |
|---|---|
| `AgentBackendPort` | Stream from a per-chat agent subprocess. `send`, `changeWorkspace`, `restart`, `shutdown`, `isAlive`. |
| `TelegramTransport` | Outbound Telegram: `sendMessage` (returns id), `editMessage`, `sendFile`; inbound via `onUpdate(handler)`. |
| `WebhookServerPort` | HTTP server lifecycle + `status()` (endpoint enablement + last-event timestamps). |
| `ServiceProxyPort` | Declarative outbound HTTP proxy with SSRF guard + auth injection. |
| `ConfigResolverPort` | Six-tier resolver returning `{value, tier}` for `model` / `timeoutSeconds` / `maxBudgetUsd` / `contextWindow` / `idleTimeoutMin`. |
| `SessionStore` | Per-chat Claude session row (`sessionId`, `model`, `totalCostUsd`, `lastUsedAt`). |
| `JobStore` | Persisted scheduled jobs (`list` / `get` / `insert` / `update` / `delete` / `stampFired` / `allActive`). |
| `SettingsStore` | `ws_config:{chatId}:{ws}:{field}` + `user_config:{chatId}:{field}` CRUD. |
| `HistoryStore` | Daily-rotated JSONL of user + assistant lines per chat; `tail(n)`. |
| `AllowedWorkspaceStore` | Per-chat allow-list of absolute workspace paths. |
| `WorkspaceHistoryStore` | Most-recently-used workspace per chat (backed by `SettingsStore` under `ws_current:`). |
| `SchedulerPort` | `start(fire)` / `register(job)` / `unregister(jobId)` / `rehydrate` / `stop`. |
| `LockPort` | Per-chat serial lock (`withLock`, `tryWithLock`). |
| `FsPort` | Audited filesystem surface — `readFile`, `writeFile`, `appendLine`, `mkdirp`, `realpath`, `exists`, `unlink`, `listDir`. |
| `CrashRecoveryPort` | Marks/clears pending-response flags; boot restore scans the flag dir. |
| `LoggerPort` | Structured logging with bindings (Pino under the hood). |
| `ClockPort` | Monotonic `nowMs()` + `now(): Date`. VirtualClock for tests. |

## Data Flow — Inbound Telegram Message

```
 grammY update       TelegramTransport.onUpdate(handler)
       │
       ▼
 TelegramPresenter.handleUpdate(update)            # composition/
       │
       ├──► parseCommand → dispatchCommand         # usecases/telegram/ (pure)
       │          │
       │          └► effect descriptor (discriminated union)
       │
       └──► SendMessageToAgent(chatId, text)       # usecases/
                  │
                  ├─ LockPort.withLock(chatId)
                  ├─ ConfigResolverPort.resolve → BackendConfig
                  ├─ evaluateBudget (pre-flight)
                  ├─ CrashRecoveryPort.mark
                  ├─ HistoryStore.append (user line)
                  ├─ AgentBackendPort.send → AsyncIterable<StreamChunk>
                  │     │
                  │     └► StreamEventThrottle → emit kind=send | edit
                  │              │
                  │              └► TelegramTransport.sendMessage / editMessage
                  │                    (with MarkdownFallback)
                  │
                  ├─ HistoryStore.append (assistant line)
                  ├─ SessionStore.upsert (sessionId, costUsd)
                  └─ CrashRecoveryPort.clear
```

## Six-Tier Config Precedence

`ResolveUserBackendConfig` (pure) walks providers in order for each field. First non-null wins.

| Tier | Source | Example |
|---|---|---|
| 1 | `ws_config:{chatId}:{ws}:{field}` (SQLite) | `/settings model opus` in workspace `proj` |
| 2 | `workspaces.yaml` → `workspaces[*].claude.{field}` | Per-workspace YAML overrides |
| 3 | `user_config:{chatId}:{field}` (SQLite) | `/settings model opus` at user scope |
| 4 | `users.yaml` → `users[*].{field}` | Per-user YAML defaults |
| 5 | Env (`LUNA_MODEL`, `LUNA_TIMEOUT_S`, …) | Operator defaults |
| 6 | Compiled defaults (`sonnet`, 300 s, …) | Final fallback |

Tier info is returned alongside the value (`{value, tier}`) so `/settings` can render `model: opus (workspace DB)` and operators can debug precedence issues directly.

## SSRF Guard (`isBlockedAddress`)

The `UndiciServiceProxy` resolves the target hostname ONCE via `dns.promises.lookup`, pins the IP into `undici.Agent.connect.lookup`, and rejects the resolved address if it matches any of:

| Range | Why |
|---|---|
| `0.0.0.0/8` | Any-host sentinel. |
| `10.0.0.0/8` | Private (RFC 1918). |
| `127.0.0.0/8` | Loopback. |
| `169.254.0.0/16` | Link-local (incl. cloud metadata `169.254.169.254`). |
| `172.16.0.0/12` | Private. |
| `192.168.0.0/16` | Private. |
| `224.0.0.0/4` | Multicast. |
| `240.0.0.0/4` | Reserved / future use. |
| `::` / `::1` | IPv6 unspecified / loopback. |
| `fc00::/7` | IPv6 ULA. |
| `fe80::/10` | IPv6 link-local. |
| `ff00::/8` | IPv6 multicast. |
| `::ffff:<v4>` | IPv4-mapped IPv6 — flattened and re-checked against v4 table. |

Test fixtures may set `allow_internal: true` on a service entry to bypass the guard; production `services.yaml` must set it to `false`.

## Scheduler Semantics

Three schedule shapes (persisted as a discriminated union in `JobRow.schedule`):

| Kind | Shape | `nextFireAt` behaviour |
|---|---|---|
| `once` | `{ atIso }` | Past-due at boot → fire immediately (catch-up). After fire: `stampFired` + unregister. |
| `interval` | `{ seconds, firstRunIso? }` | Next tick = `firstRunIso` if in future, else `now + seconds`. |
| `daily` | `{ timesUtc[] }` | Earliest remaining slot today; otherwise tomorrow's first. |

Rehydration on `scheduler.start(fire)` loads `jobStore.allActive()`. `RunScheduledFire` dispatches reminders verbatim via Telegram; agent jobs delegate to `SendMessageToAgent`. If `autoRemove` is set and the final assistant text contains the literal `CONDITION_MET`, the job is deleted + unregistered + user notified.

## Path Confinement

Every workspace-adjacent I/O path passes through `assertConfined(fs, target, base)`:

1. `realpath(base)` — canonicalise.
2. `realpath(target)` (fall back to textual path if not yet on disk).
3. `path.relative(baseReal, targetReal)` — if it starts with `..` or is absolute, throw `PathConfinementError`.

This is the ONLY path validator in Luna. The `POST /api/send-file` route AND every workspace use case funnel through it.

## Extension Points

### Add a new agent backend

1. Implement `AgentBackendPort` under `src/infra/backends/<name>-backend.ts`. The key method is `send`: an async generator yielding `StreamChunk`s.
2. Add composition in `src/composition/<name>-backend-container.ts` that returns an `AgentBackendContainer` with `backend`, `crashRecovery`, `aborts`, `shutdown`.
3. Wire in `full-app-container.ts` behind an env flag (e.g. `LUNA_BACKEND=openai`). Keep the default `claude` path intact.
4. Add a contract test reusing `tests/contract/agent-backend.contract.ts` parameterised over the fake + new implementation.

### Add a new webhook route

1. Add the handler directly in `src/composition/http/hono-webhook-server.ts` — `this.app.post("/webhook/<name>", …)`.
2. If the route needs HMAC verification, add a usecase under `src/usecases/http/<name>-verifier.ts`. If it needs payload parsing, add `src/usecases/http/parse-<name>.ts`.
3. Register a `WebhookStatsPort` entry in the `HonoWebhookServer` constructor so `/webhooks` reflects the new endpoint.
4. Add a contract test in `tests/contract/hono-webhook-server.contract.test.ts` and (optionally) an integration test in `tests/integration/`.

### Add a new Telegram command

1. Add the command token to `KNOWN_COMMANDS` in `src/usecases/telegram/parse-command.ts`.
2. Add a new `CommandEffect` variant in `src/usecases/telegram/dispatch-command.ts` and a `case` that emits it.
3. Handle the effect in `TelegramPresenter.handleCommand` (`src/composition/telegram-presenter.ts`). If it needs a new usecase, drop it in `src/usecases/<area>/<verb>.ts`.
4. Write a pure dispatcher test (`tests/unit/usecases/dispatch-command.test.ts`) and a presenter integration test (`tests/unit/composition/telegram-presenter.test.ts`).

### Add a new outbound service (service proxy)

1. Add an entry to `config/services.yaml` matching `ServicesYamlSchema` (see `src/infra/config/services-yaml-schema.ts`).
2. Ensure the env var it names (`auth.from_env`) is present — missing env makes the proxy throw `ConfigError`.
3. No code change needed — `ServicesRepo.fromFile` reads the new entry on next boot.

### Add a new store port

1. Define the interface under `src/adapters/ports/<name>.port.ts`.
2. Write a contract suite `tests/contract/<name>.contract.ts` parameterised over `[Fake, Real]`.
3. Add the in-memory fake under `tests/helpers/fakes/fake-<name>.ts`.
4. If SQLite-backed, add a Drizzle table in `src/infra/db/schema.ts` + migration SQL under `migrations/`.
5. Wire the concrete store in `src/composition/container.ts`.

## Testing Pyramid

- **unit** (`tests/unit/`): pure functions and usecase-level behaviour against in-memory fakes. Fast; hundreds of cases.
- **contract** (`tests/contract/`): a single shared suite per port run against both the fake and the real implementation. Guarantees the fake stays honest.
- **integration** (`tests/integration/`): real Drizzle on a tmp file, real Hono `Bun.serve` on an ephemeral port, `FakeAgentBackend` (the pooled Claude backend is bypassed via `agentBackendOverride` because AsyncMutex is non-reentrant and the integration pool would deadlock the per-chat lock — see comment in `full-app-container.ts`).

## Error Hierarchy

All thrown errors extend `LunaError` (`src/entities/errors.ts`). Each has a stable `.code` that routes, presenters, and logs map to user-facing messages or HTTP statuses:

| Class | `.code` | Typical disposition |
|---|---|---|
| `AuthError` | `AUTH` | 401 or silent-drop from `TelegramTransport` |
| `ConfigError` | `CONFIG` | Fatal at boot; 400 at runtime |
| `BackendError` | `BACKEND` | User-facing "Backend failed." |
| `PathConfinementError` | `PATH_ESCAPE` | 403 on HTTP; "Path escapes WORKSPACE_BASE." on Telegram |
| `WebhookSignatureError` | `WEBHOOK_SIG` | 401 |
| `SSRFError` | `SSRF` | 403 from `/api/service/:name` |
| `RateLimitError` | `RATE_LIMIT` | User-facing "Budget exceeded." |
| `StaleSessionError` | `STALE_SESSION` | Auto-retry-after-clear in `ClaudeCodeBackend` |

## Boundaries Gate

`scripts/check.sh` runs:

1. `biome format .`
2. `tsc --noEmit`
3. `bun test`
4. `bash scripts/check-boundaries.sh` (ESLint with `boundaries/element-types: error`).

Every commit should leave this green. CI does the same.
