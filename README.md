# Luna

Clean-Architecture TypeScript port of [Kai](https://github.com/keironcl/kai) — a Telegram ↔ agent bridge.

**Status:** Phase 0 (tracer bullet). Boots a Telegram bot that replies `echo: <text>` to allow-listed users.

## Stack

- Runtime: [Bun](https://bun.sh) (>= 1.1)
- Telegram: [grammY](https://grammy.dev)
- Validation: zod
- Logging: pino
- Testing: `bun:test`

## Layout

```
src/
  entities/     pure types, no deps
  usecases/     application logic, ports only
  adapters/     port interfaces
  infra/        concrete implementations
  composition/  DI root
  app/          process entrypoint
tests/
  unit/
  integration/
```

## Quickstart

```bash
bun install
cp .env.example .env   # fill TELEGRAM_BOT_TOKEN, TELEGRAM_ALLOWED_IDS
bun run dev
```

## Tests

```bash
bun test                # unit + component
LUNA_E2E=1 bun test     # include real Telegram E2E (requires real bot token)
```

## License

Apache-2.0.
