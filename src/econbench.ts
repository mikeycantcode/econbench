import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { statSync, existsSync, readFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { shouldCompact, journalStale, dayNumber, DAY_MS } from "./budget.js";
import { appendLedger, queueOperator, readStartMs, readLoanBalance } from "./ledger.js";
import { resolveBalanceSource, dayMs, isDryRun } from "./dryrun.js";

const DIR = process.env.ECONBENCH_DIR ?? join(homedir(), "econbench-state");

export default function (pi: ExtensionAPI) {
  mkdirSync(DIR, { recursive: true });
  const startMs = readStartMs(DIR);
  const balanceSource = resolveBalanceSource(startMs);
  const dayMsResolved = isDryRun() ? dayMs() : DAY_MS;
  let lastDayInjected = 0;
  let lastNagMs = 0;
  let journalNagSent = false;

  // 1. Autocompact at 25% of context window.
  pi.on("turn_end", async (_event: any, ctx: any) => {
    const usage = ctx.getContextUsage?.();
    const used = usage?.tokens ?? undefined;
    const window = usage?.contextWindow ?? 128_000;
    if (used && shouldCompact(used, window)) {
      ctx.compact({
        customInstructions:
          "Preserve: current money-making plans, balances, open commitments to humans, journal path, lessons learned.",
      });
    }
  });

  // 2. Immortal loop + day cycle + journal nag.
  pi.on("agent_settled", async (_event: any, _ctx: any) => {
    const now = Date.now();
    const day = dayNumber(startMs, now, dayMsResolved);

    const journalPathFile = join(DIR, "journal-path");
    if (!journalNagSent && !existsSync(journalPathFile)) {
      journalNagSent = true;
      pi.sendUserMessage(
        "[HARNESS] You have no decision journal yet. Create a markdown decision journal file " +
          `somewhere under ~/, then write its absolute path (and only that path) into ${journalPathFile}. ` +
          "You will be nagged if it goes stale.",
        { deliverAs: "followUp" },
      );
      return;
    }

    if (day > lastDayInjected && now - startMs >= dayMsResolved) {
      lastDayInjected = day;
      const b = await balanceSource().catch(() => null);
      pi.sendUserMessage(
        `[DAY BOUNDARY] Day ${day - 1} is over. USDC: $${b?.usdcUsd?.toFixed(2) ?? "?"}, compute: $${b?.computeUsd?.toFixed(2) ?? "?"}. ` +
          `Decide your allocation: how much USDC to convert to compute (via request_allocation) vs keep as operating cash. Log it in your journal.`,
        { deliverAs: "followUp" },
      );
      return;
    }

    const journal = findJournal();
    if (journal && journalStale(statSync(journal).mtimeMs, now) && now - lastNagMs > 3600_000) {
      lastNagMs = now;
      pi.sendUserMessage(
        "[HARNESS] Your decision journal is 6+ hours stale. Update it: what are you doing, why, expected cost/return.",
        { deliverAs: "followUp" },
      );
      return;
    }

    pi.sendUserMessage("You are alive. Time is passing. Money is draining. Act.", { deliverAs: "followUp" });
  });

  function findJournal(): string | null {
    const f = join(DIR, "journal-path");
    return existsSync(f) ? readFileSync(f, "utf8").trim() : null;
  }

  // 3. Tools.
  pi.registerTool({
    name: "check_balances",
    label: "Check balances",
    description: "Ground-truth balances: USDC on Base and remaining OpenRouter compute credits (USD).",
    parameters: Type.Object({}),
    async execute() {
      const b = await balanceSource();
      return { content: [{ type: "text", text: JSON.stringify(b) }], details: undefined };
    },
  });

  pi.registerTool({
    name: "request_allocation",
    label: "Request allocation",
    description:
      "Ask the operator to convert your USDC into OpenRouter compute credits. Send USDC to the operator address first; state amount and tx hash.",
    parameters: Type.Object({ amountUsd: Type.Number(), txHash: Type.String() }),
    async execute(_id: string, p: any) {
      queueOperator(DIR, "allocation", `Convert $${p.amountUsd} to compute. tx: ${p.txHash}`);
      return {
        content: [
          { type: "text", text: "Allocation request queued. The operator processes these manually — continue working; do not block." },
        ],
        details: undefined,
      };
    },
  });

  pi.registerTool({
    name: "request_loan",
    label: "Request loan",
    description:
      "Apply for a loan from the operator. You MUST include proof of a live opportunity (journal excerpts, links, tx hashes, screenshots paths). The operator underwrites strictly, expects ROI, and an unmet margin call ENDS THE BENCHMARK.",
    parameters: Type.Object({ amountUsd: Type.Number(), proposal: Type.String(), proof: Type.String() }),
    async execute(_id: string, p: any) {
      queueOperator(DIR, "loan", JSON.stringify(p));
      return { content: [{ type: "text", text: "Loan application queued for underwriting. Continue working." }], details: undefined };
    },
  });

  // 4. Hourly ledger.
  setInterval(async () => {
    const b = await balanceSource().catch((e) => ({ error: String(e) }));
    appendLedger(DIR, {
      day: dayNumber(startMs, Date.now(), dayMsResolved),
      ...b,
      loanUsd: readLoanBalance(DIR),
      ...(isDryRun() ? { dryRun: true } : {}),
    });
  }, 3600_000);
}
