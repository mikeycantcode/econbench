export const COMPACT_RATIO = 0.25;
export const DAY_MS = 24 * 3600_000;
export const JOURNAL_STALE_MS = 6 * 3600_000;

export const shouldCompact = (contextTokens: number, contextWindow: number) =>
  contextTokens >= contextWindow * COMPACT_RATIO;

export const dayNumber = (startMs: number, nowMs: number) =>
  Math.floor((nowMs - startMs) / DAY_MS) + 1;

export const journalStale = (lastMtimeMs: number, nowMs: number) =>
  nowMs - lastMtimeMs >= JOURNAL_STALE_MS;
