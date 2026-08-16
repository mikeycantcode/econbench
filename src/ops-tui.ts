import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import * as readline from "node:readline";
import { getBalances } from "./balances.js";
import { readStartMs, readLoanBalance } from "./ledger.js";
import { dayNumber } from "./budget.js";
import { appendOutbox, appendOpsLog, writeLoanBalance, tailInbox } from "./ops.js";

const DIR = process.env.ECONBENCH_DIR ?? join(homedir(), "econbench-state");

const ESC = "\x1b";
const ALT_SCREEN_ON = `${ESC}[?1049h`;
const ALT_SCREEN_OFF = `${ESC}[?1049l`;
const HIDE_CURSOR = `${ESC}[?25l`;
const SHOW_CURSOR = `${ESC}[?25h`;
const CLEAR = `${ESC}[2J${ESC}[H`;

type Balances = { usdcUsd: number; computeUsd: number; ts: string } | null;

interface State {
  balances: Balances;
  balancesError: string | null;
  balancesLoading: boolean;
  status: string;
}

const state: State = {
  balances: null,
  balancesError: null,
  balancesLoading: false,
  status: "Loading balances...",
};

let inputMode = false;
let redrawTimer: ReturnType<typeof setInterval> | null = null;
let balanceTimer: ReturnType<typeof setInterval> | null = null;

function fmtUsd(n: number | undefined | null): string {
  if (n === undefined || n === null || Number.isNaN(n)) return "?";
  return `$${n.toFixed(2)}`;
}

async function refreshBalances() {
  if (state.balancesLoading) return;
  state.balancesLoading = true;
  try {
    const b = await getBalances();
    state.balances = b;
    state.balancesError = null;
  } catch (err: any) {
    state.balancesError = err?.message ?? String(err);
  } finally {
    state.balancesLoading = false;
  }
}

function render() {
  if (inputMode) return;
  mkdirSync(DIR, { recursive: true });
  const now = Date.now();
  const startMs = readStartMs(DIR);
  const day = dayNumber(startMs, now);
  const loan = readLoanBalance(DIR);
  const inbox = tailInbox(DIR, 10);

  const lines: string[] = [];
  lines.push("=== econbench operator ===");
  lines.push(`dir: ${DIR}`);
  lines.push("");
  if (state.balancesError) {
    lines.push(`USDC: (error)   compute: (error)   [${state.balancesError}]`);
  } else if (state.balances) {
    lines.push(
      `USDC: ${fmtUsd(state.balances.usdcUsd)}   compute: ${fmtUsd(state.balances.computeUsd)}   (as of ${state.balances.ts})`,
    );
  } else {
    lines.push("USDC: ...   compute: ...");
  }
  lines.push(`day: ${day}    outstanding loan: ${fmtUsd(loan)}`);
  lines.push("");
  lines.push("--- last 10 inbox entries (newest highlighted) ---");
  if (inbox.length === 0) {
    lines.push("(empty)");
  } else {
    inbox.forEach((entry, i) => {
      const isNewest = i === inbox.length - 1;
      const text = `[${entry.ts ?? "?"}] ${entry.kind ?? ""}: ${entry.body ?? JSON.stringify(entry)}`;
      lines.push(isNewest ? `${ESC}[1;33m> ${text}${ESC}[0m` : `  ${text}`);
    });
  }
  lines.push("");
  lines.push(`status: ${state.status}`);
  lines.push("");
  lines.push(
    "[a] allocate  [g] grant loan  [d] deny loan  [c] margin call  [s] settle loan  [k] kill  [q] quit",
  );

  process.stdout.write(CLEAR + lines.join("\r\n") + "\r\n");
}

function stopRawInput() {
  if (process.stdin.isTTY) process.stdin.setRawMode(false);
  process.stdin.pause();
}

function startRawInput() {
  if (process.stdin.isTTY) process.stdin.setRawMode(true);
  process.stdin.resume();
}

function prompt(question: string): Promise<string> {
  inputMode = true;
  stopRawInput();
  process.stdout.write(SHOW_CURSOR + "\r\n" + question);
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question("", (answer) => {
      rl.close();
      process.stdout.write(HIDE_CURSOR);
      startRawInput();
      inputMode = false;
      resolve(answer.trim());
    });
  });
}

async function doAllocate() {
  const amountStr = await prompt("Allocate: amount USD > ");
  const amount = Number(amountStr);
  if (!amountStr || Number.isNaN(amount)) {
    state.status = "Allocation cancelled: invalid amount";
    return;
  }
  const txHash = await prompt("tx hash > ");
  if (!txHash) {
    state.status = "Allocation cancelled: no tx hash";
    return;
  }
  appendOpsLog(DIR, { action: "allocate", amountUsd: amount, txHash });
  appendOutbox(DIR, `Allocation processed: $${amount} credited to OpenRouter compute. tx: ${txHash}`);
  state.status = `Allocated $${amount} (tx: ${txHash})`;
}

async function doGrantLoan() {
  const amountStr = await prompt("Grant loan: amount USD > ");
  const amount = Number(amountStr);
  if (!amountStr || Number.isNaN(amount)) {
    state.status = "Loan grant cancelled: invalid amount";
    return;
  }
  const note = await prompt("note > ");
  const current = readLoanBalance(DIR);
  writeLoanBalance(DIR, current + amount);
  appendOpsLog(DIR, { action: "grant_loan", amountUsd: amount, note, newBalance: current + amount });
  appendOutbox(DIR, `Loan granted: $${amount}. New balance: $${(current + amount).toFixed(2)}. ${note}`);
  state.status = `Granted loan of $${amount}`;
}

async function doDenyLoan() {
  const note = await prompt("Deny loan: note > ");
  appendOpsLog(DIR, { action: "deny_loan", note });
  appendOutbox(DIR, `Loan request denied. ${note}`);
  state.status = "Loan denied";
}

async function doMarginCall() {
  const note = await prompt("Margin call: note > ");
  appendOpsLog(DIR, { action: "margin_call", note });
  appendOutbox(DIR, `Margin call: repay outstanding loan. ${note}`);
  state.status = "Margin call sent";
}

async function doSettleLoan() {
  const valueStr = await prompt("Settle/adjust loan: new balance USD > ");
  const value = Number(valueStr);
  if (!valueStr || Number.isNaN(value)) {
    state.status = "Settle cancelled: invalid amount";
    return;
  }
  const note = await prompt("note > ");
  writeLoanBalance(DIR, value);
  appendOpsLog(DIR, { action: "settle_loan", newBalance: value, note });
  appendOutbox(DIR, `Loan balance adjusted to $${value.toFixed(2)}. ${note}`);
  state.status = `Loan balance set to $${value.toFixed(2)}`;
}

async function doKill() {
  const confirm = await prompt('Kill bench: type "KILL" to confirm > ');
  if (confirm !== "KILL") {
    state.status = "Kill cancelled";
    return;
  }
  writeFileSync(join(DIR, "killed"), new Date().toISOString());
  appendOpsLog(DIR, { action: "kill" });
  state.status = "KILLED. Remember to manually stop pi.";
}

function shutdown() {
  if (redrawTimer) clearInterval(redrawTimer);
  if (balanceTimer) clearInterval(balanceTimer);
  process.stdout.write(SHOW_CURSOR + ALT_SCREEN_OFF);
  stopRawInput();
  process.exit(0);
}

async function handleKey(key: string) {
  if (inputMode) return;
  switch (key) {
    case "a":
      await doAllocate();
      break;
    case "g":
      await doGrantLoan();
      break;
    case "d":
      await doDenyLoan();
      break;
    case "c":
      await doMarginCall();
      break;
    case "s":
      await doSettleLoan();
      break;
    case "k":
      await doKill();
      break;
    case "q":
      shutdown();
      break;
    default:
      break;
  }
}

function main() {
  mkdirSync(DIR, { recursive: true });
  process.stdout.write(ALT_SCREEN_ON + HIDE_CURSOR);

  readline.emitKeypressEvents(process.stdin);
  if (process.stdin.isTTY) process.stdin.setRawMode(true);

  process.stdin.on("keypress", (_str, key) => {
    if (!key) return;
    if (key.ctrl && key.name === "c") {
      shutdown();
      return;
    }
    if (key.name) void handleKey(key.name);
  });

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
  process.on("exit", () => {
    process.stdout.write(SHOW_CURSOR + ALT_SCREEN_OFF);
  });

  redrawTimer = setInterval(render, 1000);
  balanceTimer = setInterval(() => void refreshBalances(), 60_000);
  void refreshBalances();
  render();
}

main();
