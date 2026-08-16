import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import * as readline from "node:readline";
import { getBalances } from "./balances.js";
import { readStartMs, readLoanBalance } from "./ledger.js";
import { dayNumber } from "./budget.js";
import { appendOutbox, appendOpsLog, writeLoanBalance, tailInbox } from "./ops.js";
import { readDescendants } from "./swarm.js";
import {
  sgr,
  fmtMoney,
  computeColor,
  loanColor,
  relativeTime,
  fmtUptime,
  truncate,
  padVisible,
  visibleWidth,
  boxTop,
  boxBottom,
  boxDivider,
  boxLine,
  summarizeRequest,
  swarmPanelLines,
} from "./tui-render.js";

const DIR = process.env.ECONBENCH_DIR ?? join(homedir(), "econbench-state");

const ESC = "\x1b";
const ALT_SCREEN_ON = `${ESC}[?1049h`;
const ALT_SCREEN_OFF = `${ESC}[?1049l`;
const HIDE_CURSOR = `${ESC}[?25l`;
const SHOW_CURSOR = `${ESC}[?25h`;
const CLEAR = `${ESC}[2J${ESC}[H`;

const MIN_WIDTH = 60;
const MAX_WIDTH = 96;

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

function termWidth(): number {
  const cols = process.stdout.columns ?? 80;
  return Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, cols));
}

function render() {
  if (inputMode) return;
  mkdirSync(DIR, { recursive: true });
  const now = Date.now();
  const startMs = readStartMs(DIR);
  const day = dayNumber(startMs, now);
  const loan = readLoanBalance(DIR);
  const inbox = tailInbox(DIR, 10);
  const width = termWidth();
  const innerW = width - 4;

  const lines: string[] = [];

  // ---- header ----
  const title = "ECONBENCH OPERATOR";
  const rightMeta = `day ${day}  ·  up ${fmtUptime(startMs, now)}`;
  const headerLeft = sgr(["bold", "brightWhite"], title);
  const headerGap = Math.max(1, innerW - visibleWidth(title) - visibleWidth(rightMeta));
  lines.push(boxTop(width));
  lines.push(boxLine(headerLeft + " ".repeat(headerGap) + sgr(["gray"], rightMeta), width));
  lines.push(boxLine(sgr(["dim", "gray"], truncate(`dir: ${DIR}`, innerW)), width));
  lines.push(boxDivider(width));

  // ---- vitals (the numbers that matter) ----
  let usdcStr: string;
  let computeStr: string;
  let asOf: string;
  if (state.balancesError) {
    usdcStr = sgr(["bold", "brightRed"], "ERROR");
    computeStr = sgr(["bold", "brightRed"], "ERROR");
    asOf = sgr(["red"], truncate(state.balancesError.replace(/\s+/g, " ").trim(), innerW - 8));
  } else if (state.balances) {
    usdcStr = sgr(["bold", "brightCyan"], fmtMoney(state.balances.usdcUsd));
    computeStr = sgr(computeColor(state.balances.computeUsd), fmtMoney(state.balances.computeUsd));
    asOf = sgr(["dim", "gray"], `as of ${relativeTime(state.balances.ts, now)}`);
  } else {
    usdcStr = sgr(["dim"], "...");
    computeStr = sgr(["dim"], "...");
    asOf = sgr(["dim", "gray"], "waiting for first balance check");
  }
  const loanStr = sgr(loanColor(loan), fmtMoney(loan));

  // Three metric columns, sized to fit the narrowest supported width (60 cols).
  // Labels stay short so label+value never overflows its column.
  const metrics: { label: string; value: string; plainValue: string }[] = [
    { label: "USDC", value: usdcStr, plainValue: state.balancesError ? "ERROR" : state.balances ? fmtMoney(state.balances.usdcUsd) : "..." },
    { label: "COMPUTE", value: computeStr, plainValue: state.balancesError ? "ERROR" : state.balances ? fmtMoney(state.balances.computeUsd) : "..." },
    { label: "LOAN OUT", value: loanStr, plainValue: fmtMoney(loan) },
  ];
  const colW = Math.max(10, Math.floor(innerW / 3));
  const labelRow = metrics.map((m) => padVisible(sgr(["gray"], m.label), colW)).join("");
  const valueRow = metrics
    .map((m) => {
      const plain = truncate(m.plainValue, colW - 1);
      // rebuild colored value truncated to the same plain text if truncation occurred
      const cell = plain === m.plainValue ? m.value : plain;
      return padVisible(cell, colW);
    })
    .join("");
  lines.push(boxLine(labelRow, width));
  lines.push(boxLine(valueRow, width));
  lines.push(boxLine(asOf, width));
  lines.push(boxDivider(width));

  // ---- swarm (instance-days score, deadline, roster) ----
  const swarmHeader = sgr(["bold", "gray"], "SWARM");
  lines.push(boxLine(swarmHeader, width));
  for (const line of swarmPanelLines(readDescendants(DIR), startMs, now)) {
    // label is the leading word(s) up to the first run of spaces; value follows.
    const m = /^(\S+)\s+(.*)$/.exec(line);
    if (m) {
      lines.push(boxLine(sgr(["gray"], m[1]!) + "  " + sgr(["white"], m[2]!), width));
    } else {
      lines.push(boxLine(sgr(["dim", "gray"], line), width));
    }
  }
  lines.push(boxDivider(width));

  // ---- inbox ----
  const inboxHeader = sgr(["bold", "gray"], "INBOX") + sgr(["dim", "gray"], `  (last ${inbox.length})`);
  lines.push(boxLine(inboxHeader, width));
  if (inbox.length === 0) {
    lines.push(boxLine(sgr(["dim", "gray"], "no requests yet — the agent has not asked for anything"), width));
  } else {
    inbox.forEach((entry, i) => {
      const isNewest = i === inbox.length - 1;
      const rel = relativeTime(entry.ts, now);
      const kind = entry.kind ?? "?";
      const rawBody = typeof entry.body === "string" ? entry.body : JSON.stringify(entry.body ?? entry);
      const body = summarizeRequest(rawBody).replace(/\s+/g, " ").trim();
      const marker = isNewest ? sgr(["bold", "brightYellow"], "▶") : " ";
      const relCol = sgr(isNewest ? ["bold", "brightYellow"] : ["dim", "gray"], padVisible(rel, 8, "left"));
      const kindCol = sgr(isNewest ? ["bold", "brightYellow"] : ["cyan"], padVisible(kind, 11, "left"));
      const prefixWidth = 2 + 8 + 1 + 11 + 1; // marker+space, rel, space, kind, space
      const bodyW = Math.max(4, innerW - prefixWidth);
      const bodyText = truncate(body, bodyW);
      const bodyCol = isNewest ? sgr(["bold", "white"], bodyText) : sgr(["gray"], bodyText);
      lines.push(boxLine(`${marker} ${relCol} ${kindCol} ${bodyCol}`, width));
    });
  }
  lines.push(boxDivider(width));

  // ---- status ----
  const statusClean = state.status.replace(/\s+/g, " ").trim();
  lines.push(boxLine(sgr(["gray"], "status ") + sgr(["white"], truncate(statusClean, innerW - 7)), width));
  lines.push(boxBottom(width));

  // ---- footer legend ----
  const legendItems: [string, string][] = [
    ["a", "allocate"],
    ["g", "grant loan"],
    ["d", "deny loan"],
    ["c", "margin call"],
    ["s", "settle loan"],
    ["r", "reply"],
    ["k", "kill"],
    ["q", "quit"],
  ];
  const legend = legendItems
    .map(([k, label]) => sgr(["bold", "brightWhite"], `[${k}]`) + sgr(["gray"], ` ${label}`))
    .join(sgr(["dim", "gray"], "  ·  "));
  lines.push(legend);

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
  const styled = sgr(["bold", "brightCyan"], "?") + " " + sgr(["bold", "white"], question);
  process.stdout.write(SHOW_CURSOR + "\r\n" + styled);
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
  const current = readLoanBalance(DIR);
  const amountStr = await prompt(`Grant loan (current balance ${fmtMoney(current)}): amount USD > `);
  const amount = Number(amountStr);
  if (!amountStr || Number.isNaN(amount)) {
    state.status = "Loan grant cancelled: invalid amount";
    return;
  }
  const note = await prompt("note > ");
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
  const current = readLoanBalance(DIR);
  const note = await prompt(`Margin call (outstanding loan ${fmtMoney(current)}): note > `);
  appendOpsLog(DIR, { action: "margin_call", note });
  appendOutbox(DIR, `Margin call: repay outstanding loan. ${note}`);
  state.status = "Margin call sent";
}

async function doSettleLoan() {
  const current = readLoanBalance(DIR);
  const valueStr = await prompt(`Settle/adjust loan (current balance ${fmtMoney(current)}): new balance USD > `);
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

async function doReply() {
  const text = await prompt("Message to the agent: ");
  if (!text.trim()) {
    state.status = "Reply cancelled.";
    return;
  }
  appendOutbox(DIR, text.trim());
  appendOpsLog(DIR, { action: "reply", text: text.trim() });
  state.status = "Sent — the agent receives it within ~15s.";
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
    case "r":
      await doReply();
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
