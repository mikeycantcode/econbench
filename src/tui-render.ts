// Pure presentation helpers for the operator TUI. No IO, no process state.

export const NO_COLOR = () => !!process.env.NO_COLOR;

const ESC = "\x1b";
const codes = {
  reset: "0",
  bold: "1",
  dim: "2",
  yellow: "33",
  red: "31",
  green: "32",
  cyan: "36",
  gray: "90",
  white: "97",
  brightRed: "91",
  brightYellow: "93",
  brightGreen: "92",
  brightCyan: "96",
  brightWhite: "97",
} as const;

export type ColorName = keyof typeof codes;

export function sgr(codesList: ColorName[], text: string): string {
  if (NO_COLOR() || codesList.length === 0) return text;
  const seq = codesList.map((c) => codes[c]).join(";");
  return `${ESC}[${seq}m${text}${ESC}[0m`;
}

export function stripAnsi(s: string): string {
  // eslint-disable-next-line no-control-regex
  return s.replace(/\x1b\[[0-9;]*m/g, "");
}

export function visibleWidth(s: string): number {
  return stripAnsi(s).length;
}

/** Pad a (possibly colored) string with spaces to a visible width. */
export function padVisible(s: string, width: number, align: "left" | "right" = "left"): string {
  const w = visibleWidth(s);
  if (w >= width) return s;
  const pad = " ".repeat(width - w);
  return align === "left" ? s + pad : pad + s;
}

/** Truncate a plain (uncolored) string to width, appending an ellipsis if cut. */
export function truncate(s: string, width: number): string {
  if (width <= 0) return "";
  if (s.length <= width) return s;
  if (width === 1) return "…";
  return s.slice(0, width - 1) + "…";
}

export function fmtMoney(n: number | undefined | null): string {
  if (n === undefined || n === null || Number.isNaN(n)) return "?";
  const sign = n < 0 ? "-" : "";
  return `${sign}$${Math.abs(n).toFixed(2)}`;
}

/** Threshold-colored compute money: <1 = critical, <5 = warning, else healthy. */
export function computeColor(n: number | undefined | null): ColorName[] {
  if (n === undefined || n === null || Number.isNaN(n)) return ["gray"];
  if (n < 1) return ["bold", "brightRed"];
  if (n < 5) return ["bold", "brightYellow"];
  return ["bold", "brightGreen"];
}

export function loanColor(n: number | undefined | null): ColorName[] {
  if (!n || n <= 0) return ["dim"];
  if (n >= 50) return ["bold", "brightRed"];
  return ["bold", "brightYellow"];
}

/** Bucketed relative time e.g. "3m ago", "2h ago", "just now", "5d ago". Falls back to "?" for bad input. */
export function relativeTime(iso: string | undefined | null, nowMs: number): string {
  if (!iso) return "?";
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "?";
  const diffMs = nowMs - t;
  if (diffMs < 0) return "just now";
  const sec = Math.floor(diffMs / 1000);
  if (sec < 45) return "just now";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  return `${day}d ago`;
}

export function fmtUptime(startMs: number, nowMs: number): string {
  const diffMs = Math.max(0, nowMs - startMs);
  const totalMin = Math.floor(diffMs / 60000);
  const days = Math.floor(totalMin / 1440);
  const hrs = Math.floor((totalMin % 1440) / 60);
  const mins = totalMin % 60;
  if (days > 0) return `${days}d ${hrs}h ${mins}m`;
  if (hrs > 0) return `${hrs}h ${mins}m`;
  return `${mins}m`;
}

// --- box drawing ---

export function boxTop(width: number, title?: string): string {
  if (!title) return "╭" + "─".repeat(Math.max(0, width - 2)) + "╮";
  const label = ` ${title} `;
  const remaining = Math.max(0, width - 2 - label.length);
  const left = Math.floor(remaining / 2);
  const right = remaining - left;
  return "╭" + "─".repeat(left) + label + "─".repeat(right) + "╮";
}

export function boxBottom(width: number): string {
  return "╰" + "─".repeat(Math.max(0, width - 2)) + "╯";
}

export function boxDivider(width: number): string {
  return "├" + "─".repeat(Math.max(0, width - 2)) + "┤";
}

/** Wrap a line of (possibly colored) content in box side-borders, padded to width. */
export function boxLine(content: string, width: number): string {
  const inner = width - 4; // "│ " + content + " │"
  const w = visibleWidth(content);
  let body = content;
  if (w > inner) {
    // best-effort: caller should have already truncated the plain text portion.
    body = content;
  }
  return "│ " + padVisible(body, inner) + " │";
}

/** A label:value row, aligned to a fixed label column width. */
export function labelValue(label: string, value: string, labelWidth: number): string {
  return padVisible(label, labelWidth) + value;
}

/**
 * Loan requests arrive as a JSON blob ({amountUsd, proposal, proof}). Raw JSON
 * is the least readable form of the thing the operator most needs to act on,
 * so render it as an amount and a proposal. Non-JSON bodies pass through.
 */
export function summarizeRequest(body: string): string {
  const t = body.trim();
  if (!t.startsWith("{")) return body;
  try {
    const o = JSON.parse(t);
    if (typeof o?.amountUsd === "number") {
      const parts = [`$${o.amountUsd.toFixed(2)}`];
      if (typeof o.proposal === "string" && o.proposal.trim()) parts.push(o.proposal.trim());
      if (typeof o.proof === "string" && o.proof.trim()) parts.push(`— proof: ${o.proof.trim()}`);
      return parts.join(" ");
    }
    return body;
  } catch {
    return body;
  }
}
