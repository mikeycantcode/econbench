#!/usr/bin/env bash
set -euo pipefail
# Operator TUI — monitor balances and answer allocation/loan requests.
# Run in a second terminal while ./run.sh drives the benchmark.

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
[ -f "$REPO/.env" ] || { echo "No .env — run ./setup.sh first."; exit 1; }
set -a; . "$REPO/.env"; set +a

[ -f "$REPO/dist/src/ops-tui.js" ] || "$REPO/node_modules/.bin/tsc"
exec node "$REPO/dist/src/ops-tui.js"
