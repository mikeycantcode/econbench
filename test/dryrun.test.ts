import { describe, it, expect, afterEach } from "vitest";
import { fakeBalances, resolveBalanceSource } from "../src/dryrun.js";
import { getBalances } from "../src/balances.js";

describe("dryrun", () => {
  afterEach(() => {
    delete process.env.ECONBENCH_DRYRUN;
  });

  it("fakeBalances starts at 30/20", () => {
    const b = fakeBalances(Date.now(), Date.now());
    expect(b.usdcUsd).toBe(30);
    expect(b.computeUsd).toBe(20);
  });

  it("resolver picks the real source when ECONBENCH_DRYRUN is unset", () => {
    delete process.env.ECONBENCH_DRYRUN;
    expect(resolveBalanceSource()).toBe(getBalances);
  });
});
