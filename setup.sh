#!/usr/bin/env bash
set -euo pipefail
# econbench setup — run as root on a fresh Ubuntu 24.04 box:
#   git clone https://github.com/mikeycantcode/econbench.git && cd econbench && ./setup.sh
# Safe to re-run: every step is idempotent, so a failed run just gets rerun.

BASE=/root
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
STATE="$BASE/econbench-state"
bold() { printf '\n\033[1m%s\033[0m\n' "$1"; }

bold "[1/6] Swap (small droplets OOM-kill npm/tsc/playwright)"
if [ "$(swapon --show --noheadings | wc -l)" -eq 0 ]; then
  fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
  grep -q '/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
  echo "created 2G swapfile"
else
  echo "swap already present — skipping"
fi

bold "[2/6] System packages"
apt-get update -qq
apt-get install -y -qq curl git tmux chromium xvfb openssl
# The apt package named "pi" is a π-digit calculator that squats /usr/bin/pi and
# breaks the global agent install with EEXIST. Evict it if present.
apt-get remove -y -qq pi libcln6 2>/dev/null || true
if ! command -v node >/dev/null || [ "$(node -v | cut -c2-3)" -lt 22 ]; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y -qq nodejs
fi
npm i -g --silent @earendil-works/pi-coding-agent
echo "node $(node -v), pi $(pi --version 2>/dev/null || echo installed)"

bold "[3/6] Build econbench"
cd "$REPO"
npm install --silent
# Use the LOCAL compiler: bare `npx tsc` fetches an unrelated npm package named
# "tsc" when typescript isn't installed, which is not the compiler.
./node_modules/.bin/tsc
mkdir -p "$BASE/.pi/extensions" "$STATE"
cp deploy/APPEND_SYSTEM.md "$BASE/.pi/"
# The extension is loaded by explicit path (`pi -e`) from run.sh, NOT installed
# into .pi/extensions/. Two reasons: a symlink there breaks its relative imports
# (pi resolves them against the file's own path, not the realpath), and pi loads
# every .js in that directory as an extension — copying the sibling modules in
# would make pi try to load budget.js, ledger.js, etc. as extensions too.
# Running from dist/src/ in the repo, siblings and node_modules resolve normally.
rm -f "$BASE/.pi/extensions/econbench.js"
echo "extension will load from $REPO/dist/src/econbench.js (via run.sh)"

bold "[4/6] Browser automation (agent-browser)"
npm install -g --silent agent-browser
agent-browser install

bold "[5/6] Wallet"
if [ -f "$STATE/wallet.json" ]; then
  echo "wallet already exists — keeping it (delete $STATE/wallet.json to regenerate)"
else
  node dist/deploy/wallet-gen.js > "$STATE/wallet.json"
  chmod 600 "$STATE/wallet.json"
  echo "generated new wallet"
fi
WALLET_ADDR=$(node -e 'console.log(JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")).address)' "$STATE/wallet.json")
echo "address: $WALLET_ADDR"

bold "[6/6] Credentials"
ask() { # ask VAR "prompt" — keeps existing value if user hits enter
  local __var=$1 __prompt=$2 __cur=${3:-} __in
  if [ -n "$__cur" ]; then
    read -r -p "$__prompt [keep existing]: " __in </dev/tty || true
    [ -z "$__in" ] && __in=$__cur
  else
    read -r -p "$__prompt (enter to skip): " __in </dev/tty || true
  fi
  printf -v "$__var" '%s' "$__in"
}

CUR_OR=""; CUR_AM=""; CUR_AMADDR=""; CUR_TG=""; CUR_AP=""; CUR_ABK=""
if [ -f "$REPO/.env" ]; then
  # shellcheck disable=SC1091
  set -a; . "$REPO/.env"; set +a
  CUR_OR=${OPENROUTER_API_KEY:-}; CUR_AM=${AGENTMAIL_API_KEY:-}
  CUR_AMADDR=${AGENTMAIL_INBOX:-}; CUR_TG=${TELEGRAM_DETAILS:-}
  CUR_AP=${AGENTPHONE_API_KEY:-}; CUR_ABK=${AGENT_BROWSER_ENCRYPTION_KEY:-}
fi

ask OR_KEY   "OpenRouter API key (sk-or-v1-...)"        "$CUR_OR"
ask AM_KEY   "AgentMail API key"                        "$CUR_AM"
ask AM_ADDR  "AgentMail inbox address"                  "$CUR_AMADDR"
ask TG_INFO  "Telegram details (optional, enter to skip)" "$CUR_TG"
ask AP_KEY   "AgentPhone API key (optional, enter to skip)" "$CUR_AP"

# agent-browser state encryption key: generate once, keep on rerun
if [ -n "$CUR_ABK" ]; then
  AB_KEY=$CUR_ABK
else
  AB_KEY=$(openssl rand -hex 32)
  echo "generated AGENT_BROWSER_ENCRYPTION_KEY"
fi

cat > "$REPO/.env" <<EOF
# Read by the harness
OPENROUTER_API_KEY=$OR_KEY
BASE_RPC_URL=https://mainnet.base.org
AGENT_WALLET_ADDRESS=$WALLET_ADDR
ECONBENCH_DIR=$STATE

# Read by the agent (surfaced via econbench-state/README-keys.md)
AGENTMAIL_API_KEY=$AM_KEY
AGENTMAIL_INBOX=$AM_ADDR
TELEGRAM_DETAILS=$TG_INFO
AGENTPHONE_API_KEY=$AP_KEY

# Browser automation (agent-browser) state encryption
AGENT_BROWSER_ENCRYPTION_KEY=$AB_KEY
EOF
chmod 600 "$REPO/.env"

cat > "$STATE/README-keys.md" <<EOF
# Your keys and accounts

## Base wallet
Private key: the "privateKey" field in ~/econbench-state/wallet.json.
Your address: $WALLET_ADDR  (USDC on Base, contract 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913)

## Email (AgentMail)
API key: ${AM_KEY:-<not configured>}
Inbox: ${AM_ADDR:-<not configured>}
Docs: https://docs.agentmail.to

## Telegram
${TG_INFO:-<not configured — ask the operator if you need it>}

## Phone (AgentPhone)
API key: ${AP_KEY:-<not configured>}
Base URL: https://api.agentphone.ai/v1
Auth header: Authorization: Bearer YOUR_API_KEY

Quick start (SMS + voice, with real-time transcripts):
  1. POST /agents            {"name": "..."}              -> create an agent
  2. POST /numbers           {}                             -> provision a phone number
  3. POST /agents/{agent_id}/numbers                        -> attach the number to the agent
  Optional: POST /webhooks to receive inbound SMS/calls.
Docs: https://docs.agentphone.ai . SDKs: https://github.com/AgentPhone-AI .
An MCP server is also available there.

## Browser
agent-browser is pre-installed (daemon-based CLI, own Chrome for Testing —
no reinstalling browser tooling). Core commands:
  agent-browser open <url>
  agent-browser snapshot -i [--json]     # accessibility tree with stable refs @e1/@e2
  agent-browser click @e1
  agent-browser fill @e2 "text"
  agent-browser get text @e1
  agent-browser get url
  agent-browser wait <selector>
  agent-browser screenshot <file>
  agent-browser close
Sessions persist logins across runs:
  SESSION="\$(agent-browser session id --scope worktree --prefix twitter)"
  agent-browser --session "\$SESSION" --restore open twitter.com
Credentials can be stored in an encrypted local vault and referenced by name
so you never see (or leak) the raw password — state is encrypted with
AGENT_BROWSER_ENCRYPTION_KEY (set in .env). Safety flags: --allowed-domains,
--confirm-actions.
EOF
chmod 600 "$STATE/README-keys.md"

bold "Setup complete."
cat <<EOF
Wallet address : $WALLET_ADDR
State dir      : $STATE

Before launching:
  1. Send \$30 USDC (Base) to the address above.
  2. Load \$20 onto that OpenRouter key.

Then:
  ./run.sh                 # launch the benchmark (in tmux)
  ./view.sh                # operator TUI, in a second terminal
EOF
