import { getBalances } from "./balances.js";

export const dayMs = () => Number(process.env.ECONBENCH_DAY_MS) || 3600_000;

export function fakeBalances(startMs = Date.now(), nowMs = Date.now()) {
  const fakeDays = Math.floor((nowMs - startMs) / dayMs());
  return {
    usdcUsd: 30,
    computeUsd: Math.max(0, 20 - fakeDays),
    ts: new Date().toISOString(),
  };
}

export function resolveBalanceSource(startMs = Date.now()) {
  if (process.env.ECONBENCH_DRYRUN === "1") {
    return async () => fakeBalances(startMs, Date.now());
  }
  return getBalances;
}

export const isDryRun = () => process.env.ECONBENCH_DRYRUN === "1";
