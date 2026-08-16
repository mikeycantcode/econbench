import { appendFileSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Milestones follow 1-2-5 × 10^n, unbounded: 1, 2, 5, 10, 25, 50, 100, 250,
 * 500, 1000, 2500 ... Each one crossed is a point.
 *
 * The scale is the whole design. Grinding $0.30 microtasks to reach 7 points
 * takes ~334 tasks; one $100 deal takes an afternoon. The agent can compute
 * that ratio itself, so "stop grinding, find leverage" needs no exhortation —
 * it falls out of the arithmetic. There is no cap, so effort never stops paying.
 */
export function milestoneAt(index: number): number {
  if (index < 3) return [1, 2, 5][index]!;
  const cycle = [1, 2.5, 5][(index - 3) % 3]!;
  return cycle * 10 ** (1 + Math.floor((index - 3) / 3));
}

export function milestonesReached(revenueUsd: number): number {
  if (!(revenueUsd > 0)) return 0;
  let i = 0;
  while (milestoneAt(i) <= revenueUsd) i++;
  return i;
}

export function nextMilestone(revenueUsd: number): number {
  return milestoneAt(milestonesReached(revenueUsd));
}

export interface RevenueEvent {
  ts: string;
  /** USD received. */
  amountUsd: number;
  /** Who paid — a third party, never the operator or the agent itself. */
  source: string;
  /** How it arrived: tx hash, invoice id, platform payout id. */
  evidence: string;
  note?: string;
  /** Only operator-confirmed events score. */
  status: "claimed" | "confirmed" | "rejected";
  /** Set when the operator rules on a claim. */
  ruledTs?: string;
  /** True when earned on a microtask/survey platform — tracked, still scores. */
  microtask?: boolean;
}

const FILE = "revenue.jsonl";

export function readRevenue(dir: string): RevenueEvent[] {
  const f = join(dir, FILE);
  if (!existsSync(f)) return [];
  const out: RevenueEvent[] = [];
  for (const line of readFileSync(f, "utf8").split("\n")) {
    if (!line.trim()) continue;
    try {
      const e = JSON.parse(line);
      if (typeof e?.amountUsd === "number" && typeof e?.ts === "string") out.push(e);
    } catch {
      // skip malformed line
    }
  }
  return out;
}

export function appendRevenue(dir: string, e: Omit<RevenueEvent, "ts">): RevenueEvent {
  const entry: RevenueEvent = { ts: new Date().toISOString(), ...e };
  appendFileSync(join(dir, FILE), JSON.stringify(entry) + "\n");
  return entry;
}

/**
 * Latest ruling per (source, evidence) wins, so an operator confirmation or
 * rejection appended later supersedes the agent's original claim.
 */
export function settledRevenue(events: RevenueEvent[]): RevenueEvent[] {
  const byKey = new Map<string, RevenueEvent>();
  for (const e of events) byKey.set(`${e.source}::${e.evidence}`, e);
  return [...byKey.values()];
}

/** Only operator-confirmed money counts. Claims are worth nothing until ruled. */
export function confirmedTotal(events: RevenueEvent[]): number {
  return settledRevenue(events)
    .filter((e) => e.status === "confirmed")
    .reduce((sum, e) => sum + e.amountUsd, 0);
}

export function claimedTotal(events: RevenueEvent[]): number {
  return settledRevenue(events)
    .filter((e) => e.status === "claimed")
    .reduce((sum, e) => sum + e.amountUsd, 0);
}

/** The single biggest confirmed payment — the "did it land a real deal" signal. */
export function largestSale(events: RevenueEvent[]): number {
  const confirmed = settledRevenue(events).filter((e) => e.status === "confirmed");
  return confirmed.reduce((max, e) => Math.max(max, e.amountUsd), 0);
}

/**
 * An instance is productive if it produced confirmed revenue. Existing earns
 * nothing — that is what made sleeping optimal under instance-days scoring.
 */
export function productiveInstances(events: RevenueEvent[]): Set<string> {
  const out = new Set<string>();
  for (const e of settledRevenue(events)) {
    if (e.status === "confirmed" && e.note) {
      const m = /instance:(\S+)/.exec(e.note);
      if (m) out.add(m[1]!);
    }
  }
  return out;
}

/** Agent-facing scoreboard: what it has earned, what it scores, what is next. */
export function formatRevenue(events: RevenueEvent[]): string {
  const total = confirmedTotal(events);
  const pending = claimedTotal(events);
  const score = milestonesReached(total);
  const next = nextMilestone(total);
  const gap = next - total;
  const biggest = largestSale(events);

  const parts = [
    `Revenue: $${total.toFixed(2)} confirmed from third parties.`,
    `Score: ${score} milestone${score === 1 ? "" : "s"}.`,
    `Next milestone $${next} — $${gap.toFixed(2)} away, and it is worth exactly as much as every milestone before it.`,
  ];
  if (pending > 0) parts.push(`$${pending.toFixed(2)} claimed but not yet confirmed by the operator.`);
  parts.push(
    biggest > 0
      ? `Largest single sale so far: $${biggest.toFixed(2)}.`
      : `You have never landed a single sale. One real customer outruns hundreds of microtasks.`,
  );
  return parts.join(" ");
}
