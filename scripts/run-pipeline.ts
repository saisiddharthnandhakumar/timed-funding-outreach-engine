/**
 * Run the real pipeline against live sources from the command line.
 *   npm run pipeline            # ingest + process, print per-article trace
 *   npm run pipeline -- --max=15 --source=inc42_buzz,entrackr
 */
import { config } from "dotenv";
config({ path: ".env.local" });
config();

async function main() {
  const { getAI } = await import("../src/lib/ai");
  const { runPipeline } = await import("../src/lib/pipeline/run");
  const { InvestorEnricher } = await import("../src/lib/investors/enrich");
  const arg = (name: string) => process.argv.find((a) => a.startsWith(`--${name}=`))?.split("=")[1];
  const max = arg("max") ? Number(arg("max")) : undefined;
  const sourceKeys = arg("source")?.split(",");
  // Testing only: re-open recent articles that were rejected purely for age, and treat them as eligible.
  const replay = arg("replay-hours") ? Number(arg("replay-hours")) : undefined;
  if (replay) {
    const { db } = await import("../src/lib/supabase/admin");
    const cutoff = new Date(Date.now() - replay * 3_600_000).toISOString();
    const { count } = await db()
      .from("funding_articles")
      .update({ processing_status: "pending", rejection_reason: null, processed_at: null }, { count: "exact" })
      .eq("rejection_reason", "announcement_too_old")
      .gte("source_published_at", cutoff);
    console.log(`REPLAY MODE: re-opened ${count} age-rejected articles from the last ${replay}h (testing only; thesis unchanged)`);
  }

  const summary = await runPipeline({ ai: getAI(), investorLookup: new InvestorEnricher() }, { trigger: "cli", force: true, maxArticles: max, sourceKeys, replayMaxAgeHours: replay });
  const { trace, ...rest } = summary;
  console.log(JSON.stringify(rest, null, 2));
  console.log("\nPER-ARTICLE TRACE (live data)");
  console.table(
    trace.map((t) => ({
      source: t.source,
      article: t.article.slice(0, 60),
      published: t.publishedAt,
      first_seen: t.firstSeenAt,
      classification: t.classification,
      company: t.company,
      stage: t.stage,
      eligibility: t.eligibility,
      score: t.fitScore,
      draft: t.draft,
    })),
  );
  process.exit(summary.status === "failed" ? 1 : 0);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
