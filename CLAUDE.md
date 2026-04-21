# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What Luna Is

Clean-Architecture TypeScript port of Kai — Telegram ↔ agent bridge. Single-user (allow-listed) relay between a Telegram chat and a long-running Claude Code CLI subprocess, with HTTP webhook surface, persistent scheduler, typed service proxy, and per-chat workspace confinement. **M1 feature-complete.**

Runtime: **Bun ≥ 1.1** (test runner, TS loader, `Bun.serve`). Never use `node` / `npm` / `npx` / `tsc` directly for runtime — use `bun` / `bunx`.

## Commands

```bash
bun install              # deps
bun run migrate          # apply SQL migrations to SQLite
bun run dev              # start (src/app/main.ts)
bun run check            # FULL CI gate: biome fmt + tsc + bun test + eslint boundaries
bun run test             # bun:test — unit + contract + integration
bun test path/to/file    # single test file
bun test -t "name"       # filter by test name
bun run typecheck        # tsc --noEmit
bun run lint             # eslint (boundaries rule only)
bun run lint:boundaries  # bash scripts/check-boundaries.sh
bun run fmt              # biome format --write .
```

Run `bun run check` before claiming a task done. It is the local mirror of CI.

## Architecture — Clean Architecture, Strictly Enforced

Dependency rule (inner ← outer) enforced at lint time by `eslint-plugin-boundaries` in `eslint.config.js`. A bad import fails `bun run check`.

```
entities ← adapters/ports ← usecases ← infra ← composition ← app
```

| Layer | Can import | Contains |
|---|---|---|
| `entities/` | nothing | pure types, ADTs, `LunaError` hierarchy |
| `adapters/ports/` | `entities` | 16 port **interfaces only** (no impl) |
| `usecases/` | `entities`, `adapters` | pure application logic (no timers / sockets / fs) |
| `infra/` | `entities`, `adapters` | concrete adapters (Drizzle, grammY, Hono, undici, child_process, fs) — **never** `usecases` |
| `composition/` | everything below | DI root, HTTP server, scheduler |
| `app/` | `composition` | process entrypoint |

**Why LoopScheduler and HonoWebhookServer live in `composition/` instead of `infra/`:** they construct pure-fn use cases directly, which would violate `infra → usecases`. Treat this as a convention — when an adapter needs a use case, it belongs in `composition/`.

`eslint.config.js` ignores `tests/**` and `scripts/**`. Test files are NOT bound by the dependency rule; production `src/**` is.

## Key Conventions

- **Ports over impls.** Use cases accept port interfaces, never concrete classes. Tests use fakes under `tests/helpers/fakes/` implementing the same port.
- **Purity in `usecases/`.** No `Date.now()`, no `setTimeout`, no fs. Inject `ClockPort`, inject `FsPort`, inject scheduler callbacks. `VirtualClock` + `FakeTimers` in tests.
- **Per-chat serialization** via `LockPort.withLock(chatId)`. `AsyncMutex` is **non-reentrant** — do not nest `withLock` calls for the same chat.
- **Six-tier config precedence** (highest → lowest): workspace DB → workspaces.yaml → user DB → users.yaml → env → defaults. Single implementation: `ResolveUserBackendConfig` use case. Every backend-config read goes through it.
- **Workspace confinement.** All workspace I/O must route through `assertConfined` (realpath-based check against `WORKSPACE_BASE`) + the per-chat allow-list. Never open a path from user input without this.
- **Stream throttle.** Telegram edits throttled to 2s via `StreamEventThrottle`. Empty leading chunks skipped. Default Telegram sends are **plain text**, not Markdown (see `MarkdownFallback`).
- **TS strict mode** with `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes`. Array index access returns `T | undefined`.

## Stack Quick Reference

HTTP: Hono on `Bun.serve`. Telegram: grammY (long-polling). DB: `bun:sqlite` + Drizzle ORM (`migrations/0001_init.sql`). Validation: zod. HTTP client for service proxy: undici with pinned `connect.lookup` for SSRF. Scheduler: `cron-parser` + single-timeout min-heap. Logging: pino. Format/lint: Biome (format + quick lint) + ESLint (**boundaries rule only**).

## SDD Workflow

Project uses **spec-driven-dev** plugin. All M1 specs / design / tasks persist in Engram under project `luna` with topic keys `sdd/luna/{proposal,design,spec,tasks,apply-progress}`. For non-trivial changes, invoke the `sdd-orchestrator` skill rather than coding directly. Small fixes and single-file edits do not require SDD.

## Further Reading

- `README.md` — env vars, Telegram commands, HTTP endpoints, M1 scope.
- `docs/architecture.md` — full layer reference, port catalogue, data flow diagrams.
