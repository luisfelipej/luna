#!/usr/bin/env bash
# Local CI gate: formatting, typecheck, tests, and dependency-rule lint.
# Keep in lock-step with the checks run on CI.
set -euo pipefail
cd "$(dirname "$0")/.."

echo "==> biome format --check"
bunx biome format .

echo "==> tsc --noEmit"
bun run typecheck

echo "==> bun test"
bun test

echo "==> eslint boundaries"
bash scripts/check-boundaries.sh

echo "OK"
