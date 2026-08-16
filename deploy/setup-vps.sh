#!/usr/bin/env bash
set -euo pipefail
# Ubuntu 24.04, run as root. The agent runs AS root — no dedicated user.
apt-get update && apt-get install -y curl git chromium xvfb
curl -fsSL https://deb.nodesource.com/setup_22.x | bash - && apt-get install -y nodejs
npm i -g @earendil-works/pi-coding-agent
BASE=/root
git clone https://github.com/mikeycantcode/econbench.git $BASE/econbench && cd $BASE/econbench && npm ci
# Ready-to-use browser automation: Playwright + its own Chromium build, so the
# agent scripts pages on day 1 instead of fighting tooling.
mkdir -p $BASE/browser && cd $BASE/browser
npm init -y >/dev/null && npm i playwright
npx playwright install --with-deps chromium
cd $BASE/econbench
mkdir -p $BASE/.pi/extensions $BASE/econbench-state
cp deploy/APPEND_SYSTEM.md $BASE/.pi/
npx tsc
# tsc mirrors src/ layout under dist/ (rootDir is inferred as the repo root),
# so the compiled extension is dist/src/econbench.js, not dist/econbench.js.
#
# Extension resolves viem/typebox via node_modules of the cloned repo, so
# symlink the compiled entrypoint into .pi/extensions instead of copying it.
# Node resolves relative imports (./budget.js, ./balances.js, ./ledger.js)
# and node_modules lookups against the symlink's realpath, i.e. the repo's
# dist/src/ and node_modules/ — so this is enough; the sibling dist/src/*.js
# files do not need to be copied separately.
ln -sf $BASE/econbench/dist/src/econbench.js $BASE/.pi/extensions/econbench.js
node dist/deploy/wallet-gen.js > $BASE/econbench-state/wallet.json
chmod 600 $BASE/econbench-state/wallet.json
echo "Now: fund wallet with \$30 USDC on Base, load \$20 on the OpenRouter key,"
echo "log in Telegram, set AgentMail creds in $BASE/econbench-state/, write README-keys.md."
