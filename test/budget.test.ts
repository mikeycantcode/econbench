import { describe, it, expect } from "vitest";
import { shouldCompact, dayNumber, journalStale } from "../src/budget.js";

describe("budget", () => {
  it("compacts at 25% of window", () => {
    expect(shouldCompact(24_999, 100_000)).toBe(false);
    expect(shouldCompact(25_000, 100_000)).toBe(true);
  });
  it("computes 1-based day number", () => {
    const t0 = Date.parse("2026-08-16T00:00:00Z");
    expect(dayNumber(t0, t0 + 1000)).toBe(1);
    expect(dayNumber(t0, t0 + 24 * 3600_000 + 1)).toBe(2);
  });
  it("flags journal stale at 6h", () => {
    expect(journalStale(0, 6 * 3600_000 - 1)).toBe(false);
    expect(journalStale(0, 6 * 3600_000)).toBe(true);
  });
});
