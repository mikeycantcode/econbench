import { it, expect } from "vitest";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { writeFileSync } from "node:fs";
import { appendLedger, queueOperator, readStartMs, readLoanBalance } from "../src/ledger.js";

it("appends jsonl", () => {
  const dir = mkdtempSync(join(tmpdir(), "eb-"));
  appendLedger(dir, { day: 1, usdcUsd: 30 });
  appendLedger(dir, { day: 1, usdcUsd: 29 });
  const lines = readFileSync(join(dir, "ledger.jsonl"), "utf8").trim().split("\n");
  expect(lines).toHaveLength(2);
  expect(JSON.parse(lines[1]!).usdcUsd).toBe(29);
});

it("persists start time across calls", () => {
  const dir = mkdtempSync(join(tmpdir(), "eb-"));
  expect(readStartMs(dir)).toBe(readStartMs(dir));
});

it("queues operator messages", () => {
  const dir = mkdtempSync(join(tmpdir(), "eb-"));
  queueOperator(dir, "loan", "need $10, proof: ...");
  expect(readFileSync(join(dir, "operator-inbox.jsonl"), "utf8")).toContain("loan");
});

it("reads loan balance: missing file, numeric, garbage", () => {
  const dir = mkdtempSync(join(tmpdir(), "eb-"));
  expect(readLoanBalance(dir)).toBe(0);

  writeFileSync(join(dir, "loan-balance"), "12.5");
  expect(readLoanBalance(dir)).toBe(12.5);

  writeFileSync(join(dir, "loan-balance"), "not-a-number");
  expect(readLoanBalance(dir)).toBe(0);
});
