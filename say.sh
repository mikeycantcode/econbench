#!/usr/bin/env bash
set -euo pipefail
# Send a free-text message to the running agent.
#   ./say.sh "your text here"
# The extension polls the outbox every 15s and injects it as "[OPERATOR] ...".

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
[ -f "$REPO/.env" ] || { echo "No .env — run ./setup.sh first."; exit 1; }
set -a; . "$REPO/.env"; set +a
DIR=${ECONBENCH_DIR:-/root/econbench-state}

[ $# -ge 1 ] || { echo "usage: ./say.sh \"message to the agent\""; exit 1; }

mkdir -p "$DIR"
node -e '
  const fs = require("node:fs");
  const [dir, ...rest] = process.argv.slice(1);
  const text = rest.join(" ");
  fs.appendFileSync(dir + "/operator-outbox.jsonl",
    JSON.stringify({ ts: new Date().toISOString(), text }) + "\n");
' "$DIR" "$@"

echo "queued — the agent receives it within ~15s as [OPERATOR] ..."
