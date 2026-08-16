import { appendFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export function appendLedger(dir: string, entry: object) {
  appendFileSync(join(dir, "ledger.jsonl"), JSON.stringify({ ts: new Date().toISOString(), ...entry }) + "\n");
}

export function queueOperator(dir: string, kind: "allocation" | "loan", body: string) {
  appendFileSync(join(dir, "operator-inbox.jsonl"),
    JSON.stringify({ ts: new Date().toISOString(), kind, body }) + "\n");
}

export function readStartMs(dir: string): number {
  const f = join(dir, "start-time");
  if (!existsSync(f)) writeFileSync(f, String(Date.now()));
  return Number(readFileSync(f, "utf8"));
}

export function readLoanBalance(dir: string): number {
  const f = join(dir, "loan-balance");
  if (!existsSync(f)) return 0;
  const n = Number(readFileSync(f, "utf8").trim());
  return Number.isNaN(n) ? 0 : n;
}
