import { it, expect } from "vitest";
import { mkdtempSync, readFileSync, writeFileSync, appendFileSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { appendOutbox, appendOpsLog, readNewOutboxLines, writeLoanBalance, tailInbox } from "../src/ops.js";

it("appends {ts, text} jsonl to operator-outbox.jsonl", () => {
  const dir = mkdtempSync(join(tmpdir(), "eb-"));
  appendOutbox(dir, "hello operator");
  const lines = readFileSync(join(dir, "operator-outbox.jsonl"), "utf8").trim().split("\n");
  expect(lines).toHaveLength(1);
  const parsed = JSON.parse(lines[0]!);
  expect(parsed.text).toBe("hello operator");
  expect(typeof parsed.ts).toBe("string");
});

it("appends entries to operator-log.jsonl", () => {
  const dir = mkdtempSync(join(tmpdir(), "eb-"));
  appendOpsLog(dir, { action: "grant", amountUsd: 10 });
  const lines = readFileSync(join(dir, "operator-log.jsonl"), "utf8").trim().split("\n");
  expect(lines).toHaveLength(1);
  const parsed = JSON.parse(lines[0]!);
  expect(parsed.action).toBe("grant");
  expect(parsed.amountUsd).toBe(10);
  expect(typeof parsed.ts).toBe("string");
});

it("readNewOutboxLines: missing file returns empty with offset 0", () => {
  const dir = mkdtempSync(join(tmpdir(), "eb-"));
  const result = readNewOutboxLines(dir, 0);
  expect(result.lines).toEqual([]);
  expect(result.offset).toBe(0);
});

it("readNewOutboxLines: initial offset at current size skips pre-existing lines", () => {
  const dir = mkdtempSync(join(tmpdir(), "eb-"));
  appendOutbox(dir, "old line 1");
  appendOutbox(dir, "old line 2");
  const startOffset = statSync(join(dir, "operator-outbox.jsonl")).size;

  const result = readNewOutboxLines(dir, startOffset);
  expect(result.lines).toEqual([]);
  expect(result.offset).toBe(startOffset);
});

it("readNewOutboxLines: incremental reads pick up new lines only", () => {
  const dir = mkdtempSync(join(tmpdir(), "eb-"));
  appendOutbox(dir, "line 1");
  const offsetAfterFirst = statSync(join(dir, "operator-outbox.jsonl")).size;

  appendOutbox(dir, "line 2");
  appendOutbox(dir, "line 3");

  const result = readNewOutboxLines(dir, offsetAfterFirst);
  expect(result.lines.map((l) => l.text)).toEqual(["line 2", "line 3"]);
  expect(result.offset).toBe(statSync(join(dir, "operator-outbox.jsonl")).size);
});

it("readNewOutboxLines: tolerates partial trailing line, leaving it for next read", () => {
  const dir = mkdtempSync(join(tmpdir(), "eb-"));
  appendOutbox(dir, "complete line");
  const offsetAfterComplete = statSync(join(dir, "operator-outbox.jsonl")).size;

  // Write a partial line with no trailing newline.
  appendFileSync(join(dir, "operator-outbox.jsonl"), JSON.stringify({ ts: "x", text: "partial" }));

  const result = readNewOutboxLines(dir, offsetAfterComplete);
  expect(result.lines).toEqual([]);
  // offset should not advance past the last complete newline (i.e. stays at offsetAfterComplete)
  expect(result.offset).toBe(offsetAfterComplete);

  // Now complete the line and read again from the returned offset.
  appendFileSync(join(dir, "operator-outbox.jsonl"), "\n");
  const result2 = readNewOutboxLines(dir, result.offset);
  expect(result2.lines.map((l) => l.text)).toEqual(["partial"]);
});

it("readNewOutboxLines: handles multi-byte UTF-8 content without desyncing offset", () => {
  const dir = mkdtempSync(join(tmpdir(), "eb-"));
  appendOutbox(dir, "café → 💰");
  const offsetAfterFirst = statSync(join(dir, "operator-outbox.jsonl")).size;

  appendOutbox(dir, "second line");

  const result = readNewOutboxLines(dir, offsetAfterFirst);
  expect(result.lines.map((l) => l.text)).toEqual(["second line"]);
  expect(result.offset).toBe(statSync(join(dir, "operator-outbox.jsonl")).size);
});

it("readNewOutboxLines: skips unparseable lines instead of throwing", () => {
  const dir = mkdtempSync(join(tmpdir(), "eb-"));
  appendOutbox(dir, "good line 1");
  appendFileSync(join(dir, "operator-outbox.jsonl"), "not json at all\n");
  appendOutbox(dir, "good line 2");

  const result = readNewOutboxLines(dir, 0);
  expect(result.lines.map((l) => l.text)).toEqual(["good line 1", "good line 2"]);
});

it("writeLoanBalance: writes usd value readable back", () => {
  const dir = mkdtempSync(join(tmpdir(), "eb-"));
  writeLoanBalance(dir, 42.5);
  expect(readFileSync(join(dir, "loan-balance"), "utf8").trim()).toBe("42.5");
});

it("tailInbox: missing file returns []", () => {
  const dir = mkdtempSync(join(tmpdir(), "eb-"));
  expect(tailInbox(dir, 10)).toEqual([]);
});

it("tailInbox: returns last n parsed entries, skipping unparseable lines", () => {
  const dir = mkdtempSync(join(tmpdir(), "eb-"));
  const f = join(dir, "operator-inbox.jsonl");
  writeFileSync(
    f,
    [
      JSON.stringify({ kind: "loan", body: "1" }),
      "not json",
      JSON.stringify({ kind: "loan", body: "2" }),
      JSON.stringify({ kind: "loan", body: "3" }),
    ].join("\n") + "\n",
  );
  const result = tailInbox(dir, 2);
  expect(result).toHaveLength(2);
  expect(result[0]!.body).toBe("2");
  expect(result[1]!.body).toBe("3");
});
