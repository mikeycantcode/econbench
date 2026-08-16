#!/usr/bin/env bash
set -euo pipefail
# Ubuntu 24.04, run as root.
apt-get update && apt-get install -y curl git chromium-browser xvfb
curl -fsSL https://deb.nodesource.com/setup_22.x | bash - && apt-get install -y nodejs
npm i -g @earendil-works/pi-coding-agent
useradd -m -s /bin/bash survivor
BASE=/home/survivor
git clone <THIS_REPO_URL> $BASE/econbench && cd $BASE/econbench && npm ci
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
chown -R survivor:survivor $BASE
echo "Now: fund wallet with \$30 USDC on Base, load \$20 on the OpenRouter key,"
echo "log in Telegram, set AgentMail creds in $BASE/econbench-state/, write README-keys.md."
