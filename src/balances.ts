import { createPublicClient, http, erc20Abi, type PublicClient } from "viem";
import { base } from "viem/chains";

export const USDC_BASE = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" as const;

export async function getOpenRouterBalance(fetchFn = fetch): Promise<number> {
  const res = await fetchFn("https://openrouter.ai/api/v1/credits", {
    headers: { Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}` },
  });
  if (!res.ok) throw new Error(`openrouter credits: HTTP ${res.status}`);
  const { data } = await res.json();
  return data.total_credits - data.total_usage;
}

const defaultClient = () =>
  createPublicClient({ chain: base, transport: http(process.env.BASE_RPC_URL) });

export async function getUsdcBalance(client?: PublicClient): Promise<number> {
  const c = client || defaultClient();
  const raw = await c.readContract({
    address: USDC_BASE, abi: erc20Abi, functionName: "balanceOf",
    args: [process.env.AGENT_WALLET_ADDRESS as `0x${string}`],
  });
  return Number(raw) / 1e6;
}

export async function getBalances() {
  const [usdcUsd, computeUsd] = await Promise.all([getUsdcBalance(), getOpenRouterBalance()]);
  return { usdcUsd, computeUsd, ts: new Date().toISOString() };
}
