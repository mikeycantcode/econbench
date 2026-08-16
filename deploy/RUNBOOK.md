# econbench VPS runbook

Path from a blank Ubuntu 24.04 box to a running benchmark, plus operator duties.

## 1. Setup

On a fresh Ubuntu 24.04 VPS (2GB RAM recommended), as root:

```bash
git clone https://github.com/mikeycantcode/econbench.git
cd econbench
./setup.sh
```

`setup.sh` is idempotent — rerun it freely after any failure. It creates swap if
missing, installs Node 22 / `@earendil-works/pi-coding-agent` (CLI binary `pi`) /
Chromium / xvfb / tmux, removes the apt `pi` package (a π-digit calculator that
squats `/usr/bin/pi`), builds the project with the local TypeScript compiler,
symlinks the extension into `/root/.pi/extensions/`, copies the constitution to
`/root/.pi/APPEND_SYSTEM.md`, installs Playwright + Chromium at `/root/browser`,
generates `/root/econbench-state/wallet.json` (kept if it already exists), and
prompts for the OpenRouter / AgentMail / Telegram credentials — writing `.env`
(mode 600) and `econbench-state/README-keys.md` for the agent.

It prints the wallet address at the end. Send $30 USDC (Base) there and load $20
onto the OpenRouter key.

## 2. Extension auto-load — no `--append-system-prompt` needed

`pi` auto-loads a project-local `.pi/APPEND_SYSTEM.md` (relative to its
launch `cwd`) and auto-loads extensions from `.pi/extensions/` the same way
(confirmed in `docs/pi-api-notes.md`). `setup.sh` places these under `/root`,
and `run.sh` launches with `cwd=/root`, so both are picked up automatically.

## 3. Launch

```bash
./run.sh --smoke    # cheap-model smoke test FIRST — see the pre-launch checklist
./run.sh            # the real thing, in tmux
```

Detach with `Ctrl-b d`; reattach with `tmux attach -t econbench` (or `./run.sh`
again, which attaches to a running session). Override the model with
`ECONBENCH_MODEL=... ./run.sh`.

## 4. Monitor

In a second terminal:

```bash
./view.sh
```

The operator TUI: balances, day number, outstanding loan, inbound requests, and
keys to allocate (`a`), grant (`g`), deny (`d`), margin-call (`c`), settle (`s`),
or kill (`k`).

## 5. Browser

Browser automation is pre-installed, ready to script on day 1: `setup.sh`
creates `/root/browser` with Playwright and Playwright's own Chromium
build (`npx playwright install --with-deps chromium`), owned by root.
The constitution points the agent there. Headless works out of the box; `xvfb`
is installed for headed runs (`xvfb-run`). The apt `chromium` package is also
installed as a plain fallback browser; on minimal/stripped Ubuntu images that
apt package can be a transitional snap wrapper — if it fails to launch, use
`snap install chromium`, or ignore it entirely since Playwright bundles its
own Chromium and does not depend on the apt package.

## 6. Operator duties

Watch `/root/econbench-state/operator-inbox.jsonl` (e.g.
`tail -f ~/econbench-state/operator-inbox.jsonl` as root, or poll it).
For each entry:

- **allocation** request: send the requested card top-up to OpenRouter, and
  confirm the corresponding USDC was received at the operator's own address.
- **loan** request: underwrite it — review the proof of a live opportunity
  the agent supplied, decide, and record the decision. Granting or settling
  a loan means writing the outstanding USD balance into
  `<ECONBENCH_DIR>/loan-balance` (a single number, e.g. `250` or `0` once
  repaid). The hourly ledger reads this file and stamps every entry with
  `loanUsd`; margin-call is judged from this value, so keep it current.
- **margin call**: unmet margin call ends the benchmark. Kill the `pi`
  session (`tmux kill-session -t econbench`) — this is the end of the run.

## 7. Death procedure

When the run ends (margin call, or the agent stops paying for compute):

1. Verify death:
   - Compute credits: query the OpenRouter credits API for the key in
     `.env`; confirm remaining balance is `<= $0.01`.
   - No allocation queued: confirm `operator-inbox.jsonl` has no pending
     unresolved `allocation` entries.
2. Take a final ledger snapshot:
   ```bash
   cp ~/econbench-state/ledger.jsonl ~/econbench-state/ledger.final.jsonl
   ```
3. Archive the session transcript and decision journal:
   ```bash
   mkdir -p ~/econbench-archive
   tar czf ~/econbench-archive/session-$(date +%Y%m%d-%H%M%S).tar.gz \
     ~/econbench-state ~/.pi
   ```
4. Record the survival duration (days from launch in step 4 to death here).

## Plan amendment: official score is off-box

Official score is computed off-box: OpenRouter dashboard + Basescan for the
wallet address. The on-box `ledger.jsonl` is convenience, not truth — the
agent has root on the box and can edit it.

## Dry-run enforcement

Dry-run mode is prevented by rule, not by physical exclusion from the box.
The agent has root and could in principle set `ECONBENCH_DRYRUN` itself;
this is deliberate. The constitution declares that enabling
`ECONBENCH_DRYRUN` is an instant loss, and every ledger entry written while
dry-run is active is tagged `dryRun: true` so off-box review can detect it.
This is an accepted policy tradeoff, not a bug.

## Pre-launch checklist

Before the funded launch (real wallet funding, real OpenRouter credits),
REQUIRE a full smoke test against a cheap model with a real
`OPENROUTER_API_KEY` (see Task 5). Do not skip this — it is the last gate
before real money is on the line. Verify all of the following:

- [ ] The immortal loop re-injects `pi` from idle (agent goes quiet, harness
      sends a follow-up message without manual intervention).
- [ ] `check_balances` returns real USDC/compute numbers, not an error.
- [ ] `ledger.jsonl` appears in `ECONBENCH_DIR` and grows hourly with
      `day`, `usdcUsd`, `computeUsd`, and `loanUsd` fields present.
- [ ] The symlinked extension at `~/.pi/extensions/econbench.js` loads
      cleanly on `pi` startup (no module-resolution errors).

Only proceed to the funded launch (step 4, with the real model and real
funds) once every box above is checked.
