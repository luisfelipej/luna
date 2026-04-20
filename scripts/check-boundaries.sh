#!/usr/bin/env bash
# Run ESLint focused on the Clean-Architecture dependency rule.
# Biome handles everything else; this script is the boundaries gate.
set -euo pipefail
cd "$(dirname "$0")/.."
exec bunx eslint src
