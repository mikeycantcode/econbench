import { describe, it, expect } from "vitest";
import { getOpenRouterBalance, getUsdcBalance } from "../src/balances.js";

describe("balances", () => {
  it("parses openrouter credits", async () => {
    const fakeFetch = async () => new Response(JSON.stringify({
      data: { total_credits: 20, total_usage: 3.5 },
    }));
    expect(await getOpenRouterBalance(fakeFetch as any)).toBeCloseTo(16.5);
  });

  it("converts usdc 6-decimals", async () => {
    const fakeClient = { readContract: async () => 12_340_000n } as any;
    expect(await getUsdcBalance(fakeClient)).toBeCloseTo(12.34);
  });
});
