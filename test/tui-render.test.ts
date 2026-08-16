import { describe, it, expect, afterEach } from "vitest";
import {
  fmtMoney,
  relativeTime,
  fmtUptime,
  truncate,
  padVisible,
  visibleWidth,
  stripAnsi,
  sgr,
  computeColor,
  loanColor,
  boxTop,
  boxBottom,
  boxLine,
} from "../src/tui-render.js";

describe("fmtMoney", () => {
  it("formats positive numbers", () => {
    expect(fmtMoney(5)).toBe("$5.00");
    expect(fmtMoney(0.1)).toBe("$0.10");
  });
  it("formats negative numbers", () => {
    expect(fmtMoney(-3.4)).toBe("-$3.40");
  });
  it("handles missing/NaN", () => {
    expect(fmtMoney(undefined)).toBe("?");
    expect(fmtMoney(null)).toBe("?");
    expect(fmtMoney(NaN)).toBe("?");
  });
});

describe("relativeTime", () => {
  const t0 = Date.parse("2026-08-16T12:00:00Z");
  it("just now under 45s", () => {
    expect(relativeTime("2026-08-16T12:00:00Z", t0 + 10_000)).toBe("just now");
  });
  it("minutes bucket", () => {
    expect(relativeTime("2026-08-16T12:00:00Z", t0 + 3 * 60_000)).toBe("3m ago");
  });
  it("hours bucket", () => {
    expect(relativeTime("2026-08-16T12:00:00Z", t0 + 2 * 3600_000)).toBe("2h ago");
  });
  it("days bucket", () => {
    expect(relativeTime("2026-08-16T12:00:00Z", t0 + 3 * 24 * 3600_000)).toBe("3d ago");
  });
  it("bad/missing input", () => {
    expect(relativeTime(undefined, t0)).toBe("?");
    expect(relativeTime("not-a-date", t0)).toBe("?");
  });
});

describe("fmtUptime", () => {
  const t0 = Date.parse("2026-08-16T00:00:00Z");
  it("minutes only", () => {
    expect(fmtUptime(t0, t0 + 5 * 60_000)).toBe("5m");
  });
  it("hours and minutes", () => {
    expect(fmtUptime(t0, t0 + 2 * 3600_000 + 3 * 60_000)).toBe("2h 3m");
  });
  it("days hours minutes", () => {
    expect(fmtUptime(t0, t0 + 25 * 3600_000 + 3 * 60_000)).toBe("1d 1h 3m");
  });
});

describe("truncate", () => {
  it("leaves short strings alone", () => {
    expect(truncate("hi", 10)).toBe("hi");
  });
  it("truncates with ellipsis", () => {
    expect(truncate("hello world", 8)).toBe("hello w…");
    expect(truncate("hello world", 8).length).toBe(8);
  });
});

describe("padVisible / visibleWidth / stripAnsi", () => {
  it("pads plain strings", () => {
    expect(padVisible("ab", 5)).toBe("ab   ");
    expect(padVisible("ab", 5, "right")).toBe("   ab");
  });
  it("ignores ansi codes in width", () => {
    const colored = "\x1b[1;31mhi\x1b[0m";
    expect(visibleWidth(colored)).toBe(2);
    expect(stripAnsi(colored)).toBe("hi");
    expect(padVisible(colored, 5).length).toBeGreaterThan(5); // includes escape bytes
  });
});

describe("NO_COLOR", () => {
  afterEach(() => {
    delete process.env.NO_COLOR;
  });
  it("emits ansi codes normally", () => {
    delete process.env.NO_COLOR;
    expect(sgr(["bold"], "x")).toContain("\x1b[");
  });
  it("suppresses ansi codes when NO_COLOR is set", () => {
    process.env.NO_COLOR = "1";
    expect(sgr(["bold"], "x")).toBe("x");
  });
});

describe("threshold colors", () => {
  it("compute critical under $1", () => {
    expect(computeColor(0.5)).toContain("brightRed");
  });
  it("compute warning under $5", () => {
    expect(computeColor(3)).toContain("brightYellow");
  });
  it("compute healthy at/above $5", () => {
    expect(computeColor(10)).toContain("brightGreen");
  });
  it("loan dim at zero", () => {
    expect(loanColor(0)).toContain("dim");
  });
  it("loan warning when positive", () => {
    expect(loanColor(10)).toContain("brightYellow");
  });
  it("loan critical when large", () => {
    expect(loanColor(75)).toContain("brightRed");
  });
});

describe("box drawing", () => {
  it("boxTop centers a title", () => {
    const top = boxTop(20, "hi");
    expect(top.startsWith("╭")).toBe(true);
    expect(top.endsWith("╮")).toBe(true);
    expect(top).toContain("hi");
  });
  it("boxBottom has correct corners", () => {
    expect(boxBottom(10)).toBe("╰" + "─".repeat(8) + "╯");
  });
  it("boxLine pads content between borders", () => {
    const line = boxLine("x", 10);
    expect(line.startsWith("│ ")).toBe(true);
    expect(line.endsWith(" │")).toBe(true);
  });
});
