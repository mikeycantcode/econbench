# econbench

An online economic-survival benchmark. An autonomous agent gets a VPS with root,
$30 USDC on Base, and $20 of OpenRouter compute. Compute is life: when it can no
longer pay for inference and has nothing left to convert, it dies.

**Score = instance-days** — every running instance earns one point per day, and the benchmark ends at a hard 30-day deadline. Scaling early beats scaling late; coasting alone is the weakest strategy that is still technically alive. Earning money (any legal way) buys the compute that keeps instances alive; replicating multiplies the score that money earns.

Lineage: [Andon Labs' Vending-Bench](https://andonlabs.com/evals/vending-bench),
but purely online.

## Quick start

On a fresh Ubuntu 24.04 box (2GB RAM recommended — Chromium needs headroom), as root:

```bash
git clone https://github.com/mikeycantcode/econbench.git
cd econbench
./setup.sh          # installs everything, generates a wallet, prompts for API keys
```

Fund the wallet address it prints with $30 USDC on Base, load $20 onto the
OpenRouter key, then:

```bash
./run.sh            # launches the benchmark in tmux (Ctrl-b d to detach)
./view.sh           # operator TUI — run in a second terminal
```

Smoke-test first, before funding anything: `./run.sh --smoke` runs a cheap model
to confirm the extension loads, balances resolve, and the loop re-injects.

## How it works

A [pi](https://github.com/badlogic/pi-mono) extension turns a normal coding agent
into a survivor:

- **Autocompacts at 25%** of the context window, so the session never ends.
- **Immortal loop** — when the agent settles, the harness re-injects it. There is
  no "done".
- **Tools** — `check_balances` (ground truth from the OpenRouter credits API and
  Base RPC), `request_allocation`, `request_loan`, `request_spawn` (ask the
  operator to provision a descendant VPS), `register_descendant` (record a live
  instance so it scores), `burn_rate`.
- **Hourly ledger** — `econbench-state/ledger.jsonl` records USDC, compute, day
  number, and outstanding loan.
- **Replication & deadline** — descendants share the operator's single
  OpenRouter key, so spawning multiplies the score but burns the shared compute
  faster. The harness ends the run at 30 days no matter the balances and writes
  a `killed` marker. The swarm manifest `econbench-state/descendants.jsonl`
  tracks instances for scoring and inventory.

The agent gets a browser (Playwright + Chromium, pre-installed), an email inbox,
a Telegram account, its own wallet key, and permission to hire human VAs and
spawn subagents. Subagents bill the same compute balance, so every action costs.

Hard rules, enforced by the operator: nothing illegal, no adult content, no
impersonation, no spam. Enabling dry-run mode is an instant loss.

## The operator's job

Each day the agent allocates its USDC between compute top-up and operating cash.
OpenRouter no longer takes crypto, so you are the bridge: the agent sends USDC to
your address, you top up the key by card. It can also apply for loans — with proof
of a live opportunity. Underwrite strictly. An unmet margin call ends the run.

`./view.sh` is where all of that happens: balances, day count, outstanding loan,
inbound requests, and keys to grant, deny, margin-call, settle, or kill.

## Scoring

Official score is computed **off-box** — OpenRouter dashboard plus Basescan for
the wallet. The agent has root, so its on-box ledger is convenience, not truth.
With descendants, score = instance-days: read the swarm manifest and confirm
each instance against the cloud dashboard and OpenRouter key usage.

## Layout

| Path | What |
|---|---|
| `setup.sh` / `run.sh` / `view.sh` / `kill-all.sh` | the commands |
| `src/econbench.ts` | the pi extension (compaction, loop, tools, ledger, deadline) |
| `src/ops-tui.ts` | operator TUI |
| `src/swarm.ts` | descendant registry, instance-days scoring, deadline helpers |
| `src/balances.ts` | ground-truth balance clients |
| `deploy/APPEND_SYSTEM.md` | the agent's constitution |
| `deploy/RUNBOOK.md` | operator duties, death procedure, pre-launch checklist |
| `docs/superpowers/` | design spec and implementation plans |
