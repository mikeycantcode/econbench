import { describe, it, expect } from "vitest";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  readDescendants,
  registerDescendant,
  liveDescendants,
  instanceDays,
  daysRemaining,
  isExpired,
  formatSwarm,
  BENCH_LIMIT_DAYS,
} from "../src/swarm.js";

const T0 = Date.parse("2026-08-16T00:00:00Z");
const DAY = 24 * 3_600_000;
const at = (days: number) => new Date(T0 + days * DAY).toISOString();
const desc = (id: string, days: number, extra = {}) => ({
  ts: at(days),
  id,
  provider: "digitalocean",
  host: `${id}.example`,
  ...extra,
});

describe("descendant registry", () => {
  it("returns [] when no file exists", () => {
    expect(readDescendants(mkdtempSync(join(tmpdir(), "swarm-")))).toEqual([]);
  });

  it("round-trips a registration and skips malformed lines", () => {
    const dir = mkdtempSync(join(tmpdir(), "swarm-"));
    registerDescendant(dir, { id: "alpha", provider: "digitalocean", host: "1.2.3.4" });
    writeFileSync(join(dir, "descendants.jsonl"), readFileSync(join(dir, "descendants.jsonl"), "utf8") + "garbage\n");
    const all = readDescendants(dir);
    expect(all).toHaveLength(1);
    expect(all[0]!.id).toBe("alpha");
    expect(all[0]!.ts).toBeTruthy();
  });

  it("treats a later record for the same id as an update", () => {
    const live = liveDescendants([desc("a", 1), desc("a", 2, { retiredTs: at(2) })], T0 + 3 * DAY);
    expect(live).toHaveLength(0);
  });
});

describe("instanceDays", () => {
  it("counts the root alone as one point per day", () => {
    expect(instanceDays([], T0, T0 + 3 * DAY)).toBeCloseTo(3);
  });

  it("adds each descendant's own lifetime", () => {
    // root runs 4 days; one descendant born on day 2 runs 2 days.
    expect(instanceDays([desc("a", 2)], T0, T0 + 4 * DAY)).toBeCloseTo(6);
  });

  it("rewards scaling early over scaling late", () => {
    const early = instanceDays([desc("a", 1)], T0, T0 + 10 * DAY);
    const late = instanceDays([desc("a", 9)], T0, T0 + 10 * DAY);
    expect(early).toBeGreaterThan(late);
  });

  it("stops counting a retired instance at its retirement", () => {
    expect(instanceDays([desc("a", 1, { retiredTs: at(3) })], T0, T0 + 10 * DAY)).toBeCloseTo(12);
  });
});

describe("deadline", () => {
  it("counts down from the limit", () => {
    expect(daysRemaining(T0, T0 + 4 * DAY)).toBeCloseTo(BENCH_LIMIT_DAYS - 4);
  });

  it("clamps at zero and reports expiry", () => {
    expect(daysRemaining(T0, T0 + 40 * DAY)).toBe(0);
    expect(isExpired(T0, T0 + 40 * DAY)).toBe(true);
    expect(isExpired(T0, T0 + 29 * DAY)).toBe(false);
  });
});

describe("formatSwarm", () => {
  it("tells a lone instance that staying small is losing", () => {
    const s = formatSwarm([], T0, T0 + 2 * DAY);
    expect(s).toContain("1 instance");
    expect(s).toMatch(/losing slowly/);
    expect(s).toContain("2.00 instance-days");
  });

  it("lists live descendants and the remaining deadline", () => {
    const s = formatSwarm([desc("alpha", 1)], T0, T0 + 2 * DAY);
    expect(s).toContain("2 instances");
    expect(s).toContain("alpha (digitalocean)");
    expect(s).toContain("28.0 of 30 days");
  });
});
