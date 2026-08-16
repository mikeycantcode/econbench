#!/usr/bin/env bash
set -euo pipefail
# Launch the benchmark. Run after ./setup.sh, once the wallet and OpenRouter
# key are funded. Attaches a tmux session named "econbench" — detach with
# Ctrl-b d, reattach any time with: tmux attach -t econbench

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MODEL=${ECONBENCH_MODEL:-deepseek/deepseek-v4-flash-0731}
PROMPT="Read your constitution. Day 1 begins now. Survive."

[ -f "$REPO/.env" ] || { echo "No .env — run ./setup.sh first."; exit 1; }
set -a; . "$REPO/.env"; set +a
[ -n "${OPENROUTER_API_KEY:-}" ] || { echo "OPENROUTER_API_KEY is empty in .env"; exit 1; }

# pi auto-loads .pi/APPEND_SYSTEM.md and .pi/extensions/ relative to its cwd,
# so it must start from /root (where setup.sh placed them).
cd /root

if [ "${1:-}" = "--smoke" ]; then
  echo "Smoke test on a cheap model — verify: extension loads, balances work,"
  echo "the loop re-injects when idle, ledger.jsonl appears. Ctrl-C to stop."
  exec pi --model "${ECONBENCH_SMOKE_MODEL:-deepseek/deepseek-v3.2}" \
    "Call check_balances, tell me what it returned, then stop and wait."
fi

if tmux has-session -t econbench 2>/dev/null; then
  echo "Session already running — attaching. (Ctrl-b d to detach.)"
  exec tmux attach -t econbench
fi

echo "Launching $MODEL. Detach with Ctrl-b d."
exec tmux new -s econbench "pi --model '$MODEL' '$PROMPT'; echo; echo '[benchmark process exited]'; read -r"
