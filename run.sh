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

EXT="$REPO/dist/src/econbench.js"
# Always compile before launching. Testing only for the file's existence runs a
# stale dist/ after a git pull — the extension would silently be the old build.
"$REPO/node_modules/.bin/tsc" || { echo "Build failed — fix the errors above."; exit 1; }

# pi auto-loads .pi/APPEND_SYSTEM.md relative to its cwd, so start from /root.
# The extension is loaded by explicit path instead of from .pi/extensions/: its
# relative imports (./budget.js etc.) and node_modules only resolve correctly
# when it runs from its own dist/src/ directory in the repo.
cd /root

if [ "${1:-}" = "--smoke" ]; then
  echo "Smoke test on a cheap model — verify: extension loads, balances work,"
  echo "the loop re-injects when idle, ledger.jsonl appears. Ctrl-C to stop."
  exec pi -e "$EXT" --model "${ECONBENCH_SMOKE_MODEL:-deepseek/deepseek-v3.2}" \
    "Call check_balances, tell me what it returned, then stop and wait."
fi

if tmux has-session -t econbench 2>/dev/null; then
  echo "Session already running — attaching. (Ctrl-b d to detach.)"
  exec tmux attach -t econbench
fi

echo "Launching $MODEL. Detach with Ctrl-b d."
# Scrollback hygiene: pi redraws its whole screen constantly. Without mouse
# mode the wheel drops you into tmux copy-mode and walks back through
# thousands of near-identical redraw frames — the "scrolls to the top and
# takes forever to come back" glitch. Mouse on forwards the wheel to pi;
# a small history keeps copy-mode cheap if you do enter it.
tmux set -g mouse on 2>/dev/null || true
tmux set -g history-limit 5000 2>/dev/null || true
tmux new-session -d -s econbench \
  "pi -e '$EXT' --model '$MODEL' '$PROMPT'; echo; echo '[benchmark process exited]'; read -r"
tmux set-option -t econbench mouse on 2>/dev/null || true
exec tmux attach -t econbench
