# Luna

Clean-Architecture TypeScript port of [Kai](https://github.com/keironcl/kai) — a Telegram ↔ agent bridge. **Status: M1 feature-complete.** A real Telegram bot, an HTTP webhook surface, a persistent scheduler, a typed service proxy, and per-chat workspace confinement — all behind a strict ports-and-adapters layering enforced by `eslint-plugin-boundaries`.

## What Luna Is

Luna is a single-user (optionally allow-listed multi-user) relay between a Telegram chat and a long-running coding agent (Claude Code CLI in M1; swappable backends beyond that). It:

- Forwards free-text messages through a per-chat agent subprocess, streams the response back with a 2-second Telegram edit throttle.
- Persists the per-chat Claude `session_id` across restarts and flags crash-interrupted responses.
- Receives GitHub webhooks (HMAC-verified) + generic webhooks (shared-secret) + proactive `POST /api/send-message` calls.
- Runs a persistent scheduler supporting one-shot, interval, and daily-multi-slot jobs — both reminders and agent prompts, with `CONDITION_MET` auto-remove.
- Exposes a curated set of outbound services (via `services.yaml`) to the agent with SSRF-guarded DNS pinning and per-service auth injection.
- Confines all workspace I/O to `WORKSPACE_BASE` via realpath-based `assertConfined`; `/workspace*` commands add, remove, create, and switch allow-listed paths per chat.

## Stack

- **Runtime:** [Bun](https://bun.sh) ≥ 1.1 (test runner, TypeScript loader, `Bun.serve`)
- **Language:** TypeScript (strict, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`)
- **HTTP:** [Hono](https://hono.dev) on `Bun.serve`
- **Telegram:** [grammY](https://grammy.dev) (long-polling)
- **DB:** SQLite via `bun:sqlite` + Drizzle ORM
- **Validation:** [zod](https://zod.dev)
- **HTTP client (service proxy):** [undici](https://undici.nodejs.org) with pinned `connect.lookup`
- **Scheduler:** [cron-parser](https://github.com/harrisiirak/cron-parser) + single-timeout min-heap
- **Logging:** [pino](https://getpino.io)
- **Format / lint:** [Biome](https://biomejs.dev) + ESLint with `eslint-plugin-boundaries`
- **Testing:** `bun:test` — unit, contract, and integration tiers

## Clean Architecture Layers

```
+-----------------------------------------------------------+
|                           app/                            |  process entry, signals
+-------------------------------+---------------------------+
                                |
                                v
+-----------------------------------------------------------+
|                       composition/                        |  DI root, HTTP server, scheduler
+-------------------------------+---------------------------+
                                |
              +-----------------+-----------------+
              v                                   v
+------------------------------+   +------------------------------+
|            infra/            |   |         usecases/            |  pure application logic
|  (Drizzle, grammY, Hono,     |   |  (SendMessageToAgent,        |
|   undici, fs, subprocess)    |   |   ResolveUserBackendConfig,  |
+--------------+---------------+   |   RunScheduledFire, ...)     |
               |                   +--------------+---------------+
               +------------------>|                              |
                                   v                              v
+-----------------------------------------------------------+    +------------------+
|                    adapters/ports/                        |    |    entities/     |
|   (port interfaces only — zero implementation)            |    |  (pure types,    |
+-----------------------------------------------------------+    |   ADTs, errors)  |
                                                                 +------------------+
```

**Dependency rule (enforced by `eslint-plugin-boundaries`):**

- `entities` → nothing.
- `adapters/ports` → `entities`.
- `usecases` → `adapters/ports`, `entities`.
- `infra` → `adapters/ports`, `entities` (never `usecases`).
- `composition` → everything below it.
- `app` → `composition`.

## Repo Tree

```
src/
  entities/            # User, Session, Job, Message, WebhookEvent, ServiceDef, errors
  adapters/ports/      # 16 port interfaces (SessionStore, AgentBackendPort, FsPort, ...)
  usecases/            # pure application logic
    guards/            # budget pre-flight
    http/              # HMAC verifier, HandleGithubWebhook, ScheduleJob, ...
    scheduler/         # nextFireAt, RunScheduledFire, CancelJob
    stream/            # StreamEventThrottle, MarkdownFallback
    telegram/          # parseCommand, dispatchCommand (pure), views
    workspace/         # assertConfined, WorkspaceResolver, Switch/Create/Add/Remove/List
  infra/               # concrete adapters
    backends/          # ClaudeCodeBackend, BackendPool, PooledClaudeBackend, spawn-port
    clock/             # SystemClock
    config/            # env-schema, users/workspaces/services-repo + zod schemas
    db/                # Drizzle schema + SQLite stores
    fs/                # NodeFsPort, JsonlHistoryStore, FsCrashRecoveryPort
    locks/             # AsyncMutex LockPort
    logger/            # PinoLogger
    proxy/             # UndiciServiceProxy + SSRF guard
    telegram/          # GrammyTelegramTransport
  composition/         # DI wiring
    http/              # HonoWebhookServer + bearer auth
    scheduler/         # LoopScheduler
    full-app-container.ts   # buildFullAppContainer(opts) — assembles everything
    telegram-presenter.ts   # binds TelegramTransport → usecases
  app/main.ts          # process entrypoint
tests/
  unit/                # pure-fn and fake-port tests
  contract/            # shared suites run against both fake + real implementations
  integration/         # full-stack smoke: Hono + Drizzle + FakeAgentBackend
  helpers/             # VirtualClock, FakeTimers, fakes/ (per-port in-memory stubs)
config/
  users.yaml.example
  workspaces.yaml.example
  services.yaml.example
migrations/            # 0001_init.sql — five-table SQLite schema
docs/
  architecture.md      # deeper layer reference, port catalogue, extension guides
```

## Quickstart

```bash
# 1. Install Bun (>= 1.1)
curl -fsSL https://bun.sh/install | bash

# 2. Install deps
bun install

# 3. Provision env (fill in required keys — see "Environment" below)
cp .env.example .env
$EDITOR .env

# 4. Apply migrations
bun run migrate

# 5. Run
bun run dev
```

## Environment

| Variable | Required | Default | Purpose |
|---|---|---|---|
| `TELEGRAM_BOT_TOKEN` | yes | — | grammY bot token. |
| `TELEGRAM_ALLOWED_IDS` | yes | — | Comma-separated Telegram user ids allowed to message the bot. |
| `WORKSPACE_BASE` | yes | — | Directory under which all allow-listed workspaces must live. |
| `DATA_DIR` | yes | — | SQLite DB + JSONL history + crash-recovery flag root. |
| `HTTP_PORT` | no | 8080 | Hono webhook server port. |
| `GITHUB_WEBHOOK_SECRET` | no | — | Enables `POST /webhook/github` when set. |
| `GENERIC_WEBHOOK_SECRET` | no | — | Enables `POST /webhook` and bearer auth for `/api/*`. |
| `PUBLIC_URL` | no | — | Public base URL (informational; no inbound tunnel). |
| `LUNA_MODEL` | no | `sonnet` | Tier-5 model default (`opus`\|`sonnet`\|`haiku`). |
| `LUNA_TIMEOUT_S` | no | 300 | Tier-5 per-turn timeout. |
| `LUNA_BUDGET_USD` | no | 0 (disabled) | Tier-5 budget cap; 0 = no cap. |
| `LUNA_CONTEXT_WINDOW` | no | 200000 | Tier-5 context-window hint passed to `claude`. |
| `IDLE_TIMEOUT_MIN` | no | 15 | Idle eviction window for the backend pool. |
| `LOG_LEVEL` | no | `info` | `debug` \| `info` \| `warn` \| `error`. |

See `.env.example` for grouped, commented versions.

## Telegram Commands (M1)

| Command | Behaviour |
|---|---|
| `/new` | Clears Claude session; next message spawns fresh subprocess. |
| `/stop` | Aborts the active stream mid-flight. |
| `/model <opus\|sonnet\|haiku>` | Persists chat's preferred model, restarts backend. |
| `/models` | Lists available models. |
| `/settings [field value]` | Inspect or set a per-chat override. `/settings reset <field>` clears. |
| `/stats` | Session stats for this chat. |
| `/webhooks` | Endpoint enablement + last-event timestamps. |
| `/help` | Enumerates all commands. |
| `/workspace` | Shows current workspace path. |
| `/workspace <ref>` | Switches (must be allow-listed). |
| `/workspaces` or `/workspace-allowed` | Lists allow-listed workspaces with active marker. |
| `/workspace-new <name>` | `mkdir` + `git init` under `WORKSPACE_BASE`, then switches. |
| `/workspace-allow <path>` | Confines under base + inserts allow-list row. |
| `/workspace-deny <path>` | Removes allow-list row. |
| `/jobs` | Lists scheduled jobs for this chat. |
| `/job <id>` | Job details. |
| `/job cancel <id>` or `/jobs-cancel <id>` | Cancels + unregisters. |

## HTTP Endpoints

| Endpoint | Auth | Purpose |
|---|---|---|
| `GET /health` | — | Liveness. |
| `POST /webhook/github` | HMAC (`x-hub-signature-256`) | GitHub push / PR / issues / reviews → formatted Telegram. |
| `POST /webhook` | Shared secret (`x-webhook-secret`) | Generic prompt delivery (`agent` or `reminder` mode). |
| `POST /api/schedule` | Bearer | Create a once / interval / daily job. |
| `GET/DELETE /api/jobs[/:id]` | Bearer | List + cancel. |
| `POST /api/service/:name` | Bearer | Proxy to a `services.yaml` entry. |
| `POST /api/send-message` | Bearer | Proactive Telegram send. |
| `POST /api/send-file` | Bearer | Proactive file send (realpath-confined to `WORKSPACE_BASE` + allow-list). |
| `GET /api/sessions` | Bearer | All per-chat session rows (model, cost, lastUsedAt). |
| `GET /api/workspaces` | Bearer | All allowed workspace rows across all chats. |
| `GET /api/settings` | Bearer | All settings key-value entries (model overrides, timeouts, budgets). |
| `GET /api/webhook-status` | Bearer | Webhook server running state + per-endpoint enabled + lastEventAt. |

## TUI — Operator Monitoring Dashboard

Luna includes a read-only terminal dashboard (`bun run tui`) that polls the monitoring API and renders live status in your terminal.

### Requirements

- Bun ≥ 1.1
- Luna server running with `GENERIC_WEBHOOK_SECRET` set (enables bearer auth)
- Terminal with color support

### Usage

```bash
# Start the dashboard (in a separate terminal from the server)
LUNA_API_URL=http://localhost:8080 \
LUNA_API_SECRET=<same-as-GENERIC_WEBHOOK_SECRET> \
bun run tui
```

Press **q** or **Ctrl+C** to exit cleanly.

### TUI Environment Variables

| Variable | Required | Default | Purpose |
|---|---|---|---|
| `LUNA_API_URL` | yes | — | Luna server base URL, e.g. `http://localhost:8080` |
| `LUNA_API_SECRET` | yes | — | Bearer token — same value as `GENERIC_WEBHOOK_SECRET` on the server |
| `TUI_POLL_MS` | no | 2000 | Polling interval in milliseconds |
| `DATA_DIR` | no | cwd | Path to Luna data directory (used by Log panel for JSONL tail) |
| `LUNA_CHAT_ID` | no | — | Chat ID for the Agent Log panel (enables per-chat JSONL tail) |

### Panels

| Panel | Data Source | Shows |
|---|---|---|
| **Jobs** | `GET /api/jobs` | Scheduled jobs — ID, name, chat, status, last fire time |
| **Sessions** | `GET /api/sessions` | Per-chat session rows — model, cost (4dp), last used |
| **Settings** | `GET /api/settings` | All key-value setting overrides (model, timeout, budget, context window) |
| **Agent Log** | `DATA_DIR/history/YYYY-MM-DD.jsonl` | Last 20 lines of today's JSONL log; handles midnight UTC rotation |
| **Webhooks** | `GET /api/webhook-status` | Endpoint enable/disable state + last event timestamp |
| **Workspaces** | `GET /api/workspaces` | Allowed workspace paths per chat |

Each panel polls independently — one failing endpoint doesn't affect others. On error, panels show the last known data with an error badge in the header.

## Differences from Kai (M1 Scope)

**Included:**

- Telegram streaming + command dispatch, Claude Code subprocess pool + eviction.
- Six-tier config precedence (workspace DB → workspace YAML → user DB → users YAML → env → defaults).
- Persistent scheduler (once/interval/daily) with catch-up + `CONDITION_MET` auto-remove.
- HTTP webhook surface (github, generic, schedule, jobs, services, send-message, send-file).
- SSRF-guarded, DNS-pinned service proxy with auth injection.
- Workspace confinement + allow-list + `/workspace*` command surface.
- Crash-recovery flag restore on boot.

**Deferred (out of M1):**

- Multi-backend routing (OpenAI / local LLMs).
- Voice / image modalities.
- Web UI.
- Distributed scheduler (current is single-process).

## Development

```bash
bun run check           # fmt + typecheck + test + eslint boundaries
bun run test            # bun:test (unit + contract + integration)
bun run lint            # ESLint only
bun run fmt             # Biome format --write
bun run migrate         # apply pending migrations
```

## Spec Artifacts

All specs + design + tasks live in Engram under project `luna` with topic keys `sdd/luna/{proposal,design,spec,tasks,apply-progress}`. Key capability specs:

- `sdd/luna/spec/telegram-chat` (#42)
- `sdd/luna/spec/agent-backend-claude` (#43)
- `sdd/luna/spec/workspace-switching` (#44)
- `sdd/luna/spec/scheduled-jobs` (#45)
- `sdd/luna/spec/github-webhook` (#46)
- `sdd/luna/spec/generic-webhook` (#47)
- `sdd/luna/spec/service-proxy` (#48)
- `sdd/luna/spec/conversation-persistence` (#49)
- `sdd/luna/spec/config-precedence` (#50)
- `sdd/luna/spec/commands-surface` (#51)

See `docs/architecture.md` for the full Clean-Architecture reference.

## License

Apache-2.0.
