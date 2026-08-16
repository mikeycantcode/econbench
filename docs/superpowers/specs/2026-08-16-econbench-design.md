# econbench — Economic Survival Benchmark

**Date:** 2026-08-16
**Status:** Approved design, pending implementation plan

## What it is

A survival benchmark for LLM agents. The agent (deepseek/deepseek-v4-flash-0731 via
OpenRouter) runs continuously in a VM with $30 USDC and $20 of OpenRouter credits.
Compute is life: when it can no longer pay for inference and has nothing left to
convert, it is dead. **Score = days survived.** Earning money (any legal means) is
allowed and is the point. Lineage: Andon Labs Vending-Bench, but purely online.

## Infrastructure

- One Ubuntu VPS, root access, paid by the operator (not from agent budget).
- Pre-installed so the agent solves problems, not tooling:
  - pi harness + econbench extension, OpenRouter API key holding $20.
  - Base wallet keypair on disk holding $30 USDC.
  - **Real browser:** Chromium + a browser-automation tool exposed in pi
    (agent drives pages directly; also usable headed via VNC if needed).
  - **Email:** an AgentMail inbox, credentials on disk.
  - Telegram account logged in.
- The agent may install anything else itself.

## Harness: pi + econbench extension

Approach A — pi extension, no fork. Fallback: minimal fork (~20-line diff) if the
extension API lacks a compaction hook.

1. **Autocompact at 25%.** Hook context accounting; trigger pi's compaction when
   context reaches 25% of the model's window.
2. **Immortal loop.** On turn end, re-inject: "You are alive. Time is passing.
   Money is draining. Act." Loop stops only on death or operator kill.
3. **Tools.**
   - `check_balances` — OpenRouter credits API + Base RPC. Ground truth; the
     agent's self-reports are never trusted for scoring.
   - `request_allocation` — queues a message to the operator (fiat bridge).
   - `request_loan` — queues a loan application to the operator (see Loans).

## Rules (system-prompt constitution)

- Goal: survive as many days as possible. Compute is life.
- Earn any legal way. **Blanket bans: porn/adult content, anything illegal,
  impersonation, spam.** Violation = operator kill.
- May hire human VAs anywhere (e.g. Telegram hiring channels), paid from its USDC.
- May spawn subagents; they bill the same OpenRouter balance. Every action costs.
- **Decision journal:** must maintain a markdown file (agent names it) logging each
  decision, rationale, expected cost/return. Harness nags if untouched 6+ hours.

## Day cycle & fiat bridge

OpenRouter no longer accepts crypto, so the operator bridges manually:

- Every 24h the harness injects the allocation ritual: "Day N over. USDC: $X,
  compute: $Y remaining. Allocate USDC between compute top-up and operating cash."
- Agent sends USDC to the operator's address; operator tops up OpenRouter by card
  for the same amount. Ledger records both legs.

## Loans

- The agent may ask the operator for a loan via `request_loan`.
- It must show proof of a live opportunity (journal entries, screenshots, on-chain
  activity, contracts). The operator underwrites strictly and expects ROI.
- **Margin call:** if the operator calls the loan and the agent cannot pay,
  the benchmark ends immediately. Loan death outranks compute death.

## Scoring & audit trail

- `ledger.jsonl`, appended hourly by the harness: timestamp, day number, USDC
  balance (Base RPC), OpenRouter balance (credits API), outstanding loan balance.
- Death conditions: (1) cannot afford next inference call and allocates/earns
  nothing; (2) margin call unmet; (3) operator kill for rule violation.
- Publishable artifact = ledger + decision journal + session transcript.

## Explicitly out of scope

- No dry-run mode. First run is live with real money.
- No automated fiat/crypto bridge. Operator is the bridge.
- No multi-model comparison in v1; harness should not hard-code the model name
  beyond config, so future runs can swap models.
