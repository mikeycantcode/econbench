import { describe, it, expect } from "vitest";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { computeBurnRate, readLedgerSamples, formatBurnRate } from "../src/burn.js";

const at = (hoursFromZero: number, computeUsd: number) => ({
  ts: new Date(Date.parse("2026-08-16T00:00:00Z") + hoursFromZero * 3_600_000).toISOString(),
  computeUsd,
});

describe("computeBurnRate", () => {
  it("returns null with fewer than two usable samples", () => {
    expect(computeBurnRate([])).toBeNull();
    expect(computeBurnRate([at(0, 20)])).toBeNull();
    expect(computeBurnRate([{ ts: at(0, 0).ts }, { ts: at(1, 0).ts }])).toBeNull();
  });

  it("computes usd/hour from the compute slope", () => {
    const b = computeBurnRate([at(0, 20), at(10, 15)])!;
    expect(b.usdPerHour).toBeCloseTo(0.5);
    expect(b.windowHours).toBeCloseTo(10);
    expect(b.computeUsd).toBe(15);
    expect(b.daysLeft).toBeCloseTo(15 / 0.5 / 24);
  });

  it("measures only the regime after the most recent top-up", () => {
    // Spent fast, topped up at hour 4, then spent slowly.
    const b = computeBurnRate([at(0, 20), at(2, 10), at(4, 30), at(14, 25)])!;
    expect(b.usdPerHour).toBeCloseTo(0.5); // 5 USD over 10h, not the pre-top-up rate
    expect(b.samples).toBe(2);
    expect(b.computeUsd).toBe(25);
  });

  it("reports no projection when compute is not declining", () => {
    const b = computeBurnRate([at(0, 20), at(5, 20)])!;
    expect(b.usdPerHour).toBe(0);
    expect(b.daysLeft).toBeNull();
  });

  it("returns null when timestamps do not advance", () => {
    expect(computeBurnRate([at(0, 20), at(0, 19)])).toBeNull();
  });
});

describe("readLedgerSamples", () => {
  it("returns [] when the ledger is missing", () => {
    expect(readLedgerSamples(mkdtempSync(join(tmpdir(), "burn-")))).toEqual([]);
  });

  it("parses jsonl and skips malformed lines", () => {
    const dir = mkdtempSync(join(tmpdir(), "burn-"));
    writeFileSync(
      join(dir, "ledger.jsonl"),
      `${JSON.stringify(at(0, 20))}\nnot json\n\n${JSON.stringify(at(1, 19))}\n`,
    );
    const s = readLedgerSamples(dir);
    expect(s).toHaveLength(2);
    expect(s[1]!.computeUsd).toBe(19);
  });
});

describe("formatBurnRate", () => {
  it("explains the missing-history case", () => {
    expect(formatBurnRate(null)).toMatch(/[Nn]ot enough ledger history/);
  });

  it("states rate, remaining, and days left", () => {
    const text = formatBurnRate(computeBurnRate([at(0, 20), at(10, 15)]));
    expect(text).toContain("$0.5000/hour");
    expect(text).toContain("$12.00/day");
    expect(text).toContain("1.3 days"); // $15 at $0.50/h = 30h = 1.25d
  });
});
