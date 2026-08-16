import { describe, it, expect } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  milestoneAt,
  milestonesReached,
  nextMilestone,
  readRevenue,
  appendRevenue,
  confirmedTotal,
  claimedTotal,
  largestSale,
  productiveInstances,
  formatRevenue,
  type RevenueEvent,
} from "../src/revenue.js";

const ev = (amountUsd: number, status: RevenueEvent["status"], extra: Partial<RevenueEvent> = {}): RevenueEvent => ({
  ts: "2026-08-16T00:00:00Z",
  amountUsd,
  source: extra.source ?? `payer-${amountUsd}`,
  evidence: extra.evidence ?? `ev-${amountUsd}`,
  status,
  ...extra,
});

describe("milestone scale", () => {
  it("follows 1-2-5 x 10^n", () => {
    expect([0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map(milestoneAt)).toEqual([1, 2, 5, 10, 25, 50, 100, 250, 500, 1000]);
  });

  it("is uncapped", () => {
    expect(milestoneAt(10)).toBe(2500);
    expect(milestoneAt(15)).toBe(100000);
    expect(milestonesReached(1_000_000)).toBeGreaterThan(15);
  });

  it("counts milestones crossed", () => {
    expect(milestonesReached(0)).toBe(0);
    expect(milestonesReached(0.99)).toBe(0);
    expect(milestonesReached(1)).toBe(1);
    expect(milestonesReached(4.99)).toBe(2);
    expect(milestonesReached(100)).toBe(7);
  });

  it("makes grinding vastly worse than one real sale", () => {
    const grind = milestonesReached(334 * 0.3); // ~334 microtasks
    const oneDeal = milestonesReached(100);
    expect(oneDeal).toBeGreaterThanOrEqual(grind);
    expect(milestonesReached(30 * 0.3)).toBeLessThan(milestonesReached(100));
  });

  it("reports the next target", () => {
    expect(nextMilestone(0)).toBe(1);
    expect(nextMilestone(30)).toBe(50);
  });
});

describe("revenue ledger", () => {
  it("returns [] when absent and round-trips an append", () => {
    const dir = mkdtempSync(join(tmpdir(), "rev-"));
    expect(readRevenue(dir)).toEqual([]);
    appendRevenue(dir, { amountUsd: 12, source: "acme", evidence: "0xabc", status: "claimed" });
    const all = readRevenue(dir);
    expect(all).toHaveLength(1);
    expect(all[0]!.amountUsd).toBe(12);
    expect(all[0]!.status).toBe("claimed");
  });

  it("counts only operator-confirmed money", () => {
    const events = [ev(10, "confirmed"), ev(50, "claimed"), ev(99, "rejected")];
    expect(confirmedTotal(events)).toBe(10);
    expect(claimedTotal(events)).toBe(50);
  });

  it("lets a later ruling supersede the original claim", () => {
    const events = [
      ev(40, "claimed", { source: "acme", evidence: "inv-1" }),
      ev(40, "confirmed", { source: "acme", evidence: "inv-1" }),
    ];
    expect(confirmedTotal(events)).toBe(40);
    expect(claimedTotal(events)).toBe(0);
  });

  it("tracks the largest single confirmed sale", () => {
    expect(largestSale([ev(5, "confirmed"), ev(80, "confirmed"), ev(500, "claimed")])).toBe(80);
  });

  it("counts an instance productive only when it earned", () => {
    const events = [
      ev(5, "confirmed", { note: "instance:swarm-2 microtask batch" }),
      ev(9, "claimed", { note: "instance:swarm-3 pending" }),
    ];
    const live = productiveInstances(events);
    expect([...live]).toEqual(["swarm-2"]);
  });
});

describe("formatRevenue", () => {
  it("shames a zero-sale agent and names the next target", () => {
    const s = formatRevenue([]);
    expect(s).toContain("$0.00 confirmed");
    expect(s).toContain("Score: 0 milestones");
    expect(s).toContain("never landed a single sale");
    expect(s).toContain("Next milestone $1");
  });

  it("reports score, gap, pending claims and biggest sale", () => {
    const s = formatRevenue([ev(30, "confirmed"), ev(12, "claimed")]);
    expect(s).toContain("$30.00 confirmed");
    expect(s).toContain("Score: 5 milestones");
    expect(s).toContain("Next milestone $50");
    expect(s).toContain("$20.00 away");
    expect(s).toContain("$12.00 claimed but not yet confirmed");
    expect(s).toContain("Largest single sale so far: $30.00");
  });
});
