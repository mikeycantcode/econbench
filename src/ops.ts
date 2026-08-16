import { appendFileSync, existsSync, readFileSync, writeFileSync, statSync, openSync, readSync, closeSync } from "node:fs";
import { join } from "node:path";

export function appendOutbox(dir: string, text: string) {
  appendFileSync(join(dir, "operator-outbox.jsonl"), JSON.stringify({ ts: new Date().toISOString(), text }) + "\n");
}

export function appendOpsLog(dir: string, entry: object) {
  appendFileSync(join(dir, "operator-log.jsonl"), JSON.stringify({ ts: new Date().toISOString(), ...entry }) + "\n");
}

export function readNewOutboxLines(dir: string, fromOffset: number): { lines: { ts: string; text: string }[]; offset: number } {
  const f = join(dir, "operator-outbox.jsonl");
  if (!existsSync(f)) return { lines: [], offset: 0 };

  const size = statSync(f).size;
  if (size <= fromOffset) return { lines: [], offset: fromOffset };

  const length = size - fromOffset;
  const buf = Buffer.alloc(length);
  const fd = openSync(f, "r");
  try {
    readSync(fd, buf, 0, length, fromOffset);
  } finally {
    closeSync(fd);
  }

  const lastNewline = buf.lastIndexOf(0x0a);
  if (lastNewline === -1) {
    return { lines: [], offset: fromOffset };
  }

  const complete = buf.subarray(0, lastNewline).toString("utf8");
  const lines: { ts: string; text: string }[] = [];
  for (const l of complete.split("\n")) {
    if (l.length === 0) continue;
    try {
      lines.push(JSON.parse(l));
    } catch {
      // skip unparseable lines
    }
  }

  return { lines, offset: fromOffset + lastNewline + 1 };
}

export function writeLoanBalance(dir: string, usd: number) {
  writeFileSync(join(dir, "loan-balance"), String(usd));
}

export function tailInbox(dir: string, n: number): any[] {
  const f = join(dir, "operator-inbox.jsonl");
  if (!existsSync(f)) return [];
  const lines = readFileSync(f, "utf8").trim().split("\n").filter((l) => l.length > 0);
  const parsed: any[] = [];
  for (const l of lines) {
    try {
      parsed.push(JSON.parse(l));
    } catch {
      // skip unparseable lines
    }
  }
  return parsed.slice(-n);
}
