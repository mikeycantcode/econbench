import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

export interface LedgerSample {
  ts: string;
  computeUsd?: number;
  usdcUsd?: number;
}

export interface BurnRate {
  /** USD of compute consumed per hour, averaged over the window. */
  usdPerHour: number;
  /** Hours between the oldest and newest sample used. */
  windowHours: number;
  /** How many ledger samples informed the estimate. */
  samples: number;
  /** Compute balance at the newest sample. */
  computeUsd: number;
  /** Days of life left at this rate, or null when the rate is <= 0. */
  daysLeft: number | null;
}

/** Ledger lines, oldest first. Unparseable lines are skipped. */
export function readLedgerSamples(dir: string): LedgerSample[] {
  const f = join(dir, "ledger.jsonl");
  if (!existsSync(f)) return [];
  const out: LedgerSample[] = [];
  for (const line of readFileSync(f, "utf8").split("\n")) {
    if (!line.trim()) continue;
    try {
      const e = JSON.parse(line);
      if (typeof e?.ts === "string") out.push(e);
    } catch {
      // skip malformed line
    }
  }
  return out;
}

/**
 * Burn rate from the compute-balance slope across the samples.
 *
 * Uses first-vs-last rather than a fit: the agent tops compute up mid-run, and
 * a top-up shows as a jump. Samples after the newest increase are the only
 * ones describing the current regime, so the window starts there.
 */
export function computeBurnRate(samples: LedgerSample[]): BurnRate | null {
  const pts = samples.filter((s) => typeof s.computeUsd === "number");
  if (pts.length < 2) return null;

  // Start after the last top-up (any increase in compute balance).
  let start = 0;
  for (let i = 1; i < pts.length; i++) {
    if (pts[i]!.computeUsd! > pts[i - 1]!.computeUsd!) start = i;
  }
  const window = pts.slice(start);
  if (window.length < 2) return null;

  const first = window[0]!;
  const last = window[window.length - 1]!;
  const ms = Date.parse(last.ts) - Date.parse(first.ts);
  const windowHours = ms / 3_600_000;
  if (!(windowHours > 0)) return null;

  const spent = first.computeUsd! - last.computeUsd!;
  const usdPerHour = spent / windowHours;
  const computeUsd = last.computeUsd!;

  return {
    usdPerHour,
    windowHours,
    samples: window.length,
    computeUsd,
    daysLeft: usdPerHour > 0 ? computeUsd / usdPerHour / 24 : null,
  };
}

/** One-line summary for the agent. */
export function formatBurnRate(b: BurnRate | null): string {
  if (!b) {
    return "Not enough ledger history yet — the hourly ledger needs at least two readings. Check again later.";
  }
  const rate = b.usdPerHour;
  const perDay = rate * 24;
  const life =
    b.daysLeft === null
      ? "compute is not declining over this window, so no projection"
      : `at this rate your remaining $${b.computeUsd.toFixed(2)} lasts about ${b.daysLeft.toFixed(1)} days`;
  return [
    `Burn rate: $${rate.toFixed(4)}/hour ($${perDay.toFixed(2)}/day) of compute,`,
    `measured over ${b.windowHours.toFixed(1)}h across ${b.samples} readings.`,
    `You have $${b.computeUsd.toFixed(2)} of compute left — ${life}.`,
    `This is your cost of living. Earning less than $${perDay.toFixed(2)}/day means you are dying slowly.`,
  ].join(" ");
}
