import { after, NextResponse } from "next/server";
import { getAI } from "@/lib/ai";
import { runPipeline } from "@/lib/pipeline/run";
import { InvestorEnricher } from "@/lib/investors/enrich";
import { resolveWebsiteUrl } from "@/lib/research/website";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** Manual "Run pipeline now". Responds immediately; the run continues in the background. */
export async function POST() {
  const deadline = Date.now() + (maxDuration - 45) * 1000;
  after(async () => {
    try {
      const summary = await runPipeline({ ai: getAI(), investorLookup: new InvestorEnricher(), resolveWebsite: resolveWebsiteUrl }, { trigger: "manual", force: true, deadline });
      if (summary.status === "skipped") console.warn("manual pipeline run skipped: another run is in progress");
    } catch (err) {
      console.error("manual pipeline run failed", err);
    }
  });
  return NextResponse.json({ started: true }, { status: 202 });
}
