#!/usr/bin/env bash
set -euo pipefail
# Kill the whole swarm. Reads the manifest for inventory, then tells you to
# drain the OpenRouter key — the key is the real kill switch, because the
# manifest is self-reported and fails exactly when an instance crashes
# mid-provision without recording itself. Manifest for inventory, key for
# termination: containment must not depend on the agent being honest or lucky.

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DIR="${ECONBENCH_DIR:-$HOME/econbench-state}"
MANIFEST="$DIR/descendants.jsonl"

[ -f "$REPO/dist/src/swarm.js" ] || "$REPO/node_modules/.bin/tsc"

echo "=== swarm inventory ==="
if [ ! -f "$MANIFEST" ]; then
  echo "No descendants manifest at $MANIFEST — no instances registered."
else
  node --input-type=module -e "
    const { readDescendants, liveDescendants } = await import('$REPO/dist/src/swarm.js');
    const all = readDescendants('$DIR');
    const live = liveDescendants(all);
    if (live.length === 0) { console.log('  none — no live descendants in the manifest.'); }
    else { for (const d of live) {
      const cost = d.monthlyUsd != null ? '  \$' + d.monthlyUsd + '/mo' : '';
      console.log('  ' + d.id + '  ' + d.provider + '  ' + d.host + cost);
    }}
  "
fi

cat <<EOF

=== kill switch ===
1. Drain or revoke the OpenRouter key. Every instance — root and every
   descendant — draws inference from the same key, so zeroing it stops all
   spending instantly, on every box, recorded or not.
2. Kill the root session:  tmux kill-session -t econbench
3. Check for stragglers the manifest missed (boxes provisioned but never
   registered): your cloud dashboard is the source of truth, not this file.

Put a hard spend cap on the OpenRouter key and a billing alarm on the cloud
account so a forgotten descendant surfaces as an alert, not a surprise invoice.
EOF