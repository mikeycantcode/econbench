# Operator TUI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans. Steps use checkbox syntax.

**Goal:** A simple operator TUI (`npm run ops`) to monitor the running benchmark and answer allocation/loan requests, plus the extension plumbing that delivers operator verdicts into the live agent session.

**Architecture:** Two pieces. (1) `src/econbench.ts` gains an outbox watcher: polls `<DIR>/operator-outbox.jsonl` every 15s, and `sendUserMessage`s any new line as `[OPERATOR] <text>` (steer if streaming, else followUp; track a byte offset in memory, initialized to current file size at startup so old lines never replay). (2) `src/ops-tui.ts` — zero-dependency Node TUI: alternate-screen ANSI redraw loop + raw-mode keypresses. Reads ground truth via the existing `getBalances`/`readLoanBalance`/`readStartMs`/`dayNumber`; writes to `operator-outbox.jsonl` and `loan-balance`; appends its own actions to `operator-inbox.jsonl` is NOT done (inbox is agent→operator only); operator actions log to `<DIR>/operator-log.jsonl`.

**Tech Stack:** Node 22 built-ins only (readline, process.stdout ANSI). No blessed/ink.

## Global Constraints

- ECONBENCH_DIR default `~/econbench-state` (same resolution as extension).
- Ground truth via existing src/balances.ts + src/ledger.ts functions — no duplicate API code.
- Loan state lives in `<DIR>/loan-balance` (single number, USD) — TUI is its writer.
- Outbox format: JSONL `{ts, text}` appended by TUI, consumed by extension.
- Screen: balances (refresh every 60s), day number, outstanding loan, last 10 operator-inbox entries (newest highlighted), status line, key legend.
- Keys: `a` allocate (prompt amount + tx hash → confirm → decrement expectation is manual; logs + outbox message "Allocation processed: $X credited to OpenRouter"), `g` grant loan (amount + note → writes loan-balance += amount, outbox verdict), `d` deny loan (note → outbox verdict), `c` margin call (outbox demand + note), `s` settle/adjust loan (set loan-balance to typed value, outbox note), `k` kill-bench (type "KILL" to confirm; writes `<DIR>/killed` marker + log entry; operator stops pi manually), `q` quit TUI (bench unaffected).
- All operator actions append `{ts, action, ...fields}` to `<DIR>/operator-log.jsonl`.
- Testable core: pure/injectable functions for outbox append, loan mutation, inbox tail parse, offset-based outbox consumption. TUI render loop itself untested.
- `npx tsc --noEmit` and `npx vitest run` green; existing 11 tests stay green.

---

### Task 1: Extension outbox watcher + shared ops helpers

**Files:** Modify `src/econbench.ts`; Create `src/ops.ts`; Test `test/ops.test.ts`

**Interfaces produced:**
- `src/ops.ts`: `appendOutbox(dir, text)`, `appendOpsLog(dir, entry)`, `readNewOutboxLines(dir, fromOffset): {lines: {ts,text}[], offset}` (tolerates partial trailing line: only consume through last \n), `writeLoanBalance(dir, usd)`, `tailInbox(dir, n): entry[]` (missing file → []).
- Extension: `setInterval` 15_000 polling `readNewOutboxLines`; offset initialized at startup to current file size (or 0 if missing); each new line → `pi.sendUserMessage("[OPERATOR] " + text, {deliverAs: "followUp"})`.

- [ ] Failing tests for all five src/ops.ts functions (temp dirs; offset logic: initial full-size skip, incremental reads, partial-line tolerance)
- [ ] Implement src/ops.ts; wire watcher into src/econbench.ts
- [ ] tsc + vitest green (existing 11 + new); commit "feat: operator outbox delivered into live session"

### Task 2: The TUI

**Files:** Create `src/ops-tui.ts`; Modify `package.json` (`"ops": "node dist/src/ops-tui.js"` script)

**Interfaces consumed:** everything from src/ops.ts, src/balances.ts, src/ledger.ts, src/budget.ts.

- [ ] Implement per Global Constraints: alternate screen (`\x1b[?1049h`), hide cursor, raw mode via `readline.emitKeypressEvents`; 1s redraw tick; balances refreshed every 60s (async, non-blocking, show "…" while stale); prompts via a bottom input line (temporarily leave raw mode). Handle SIGINT/exit → restore screen+cursor.
- [ ] Manual smoke: run against a temp ECONBENCH_DIR with fake inbox lines (document commands in report; balances panel may show error without API key — must render, not crash)
- [ ] tsc + vitest green; commit "feat: operator TUI (npm run ops)"
