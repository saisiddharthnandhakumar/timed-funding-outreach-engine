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
  const arg = (name: string) => process.argv.find((a) => a.startsWith(`--${name}=`))?.split("=")[1];
  const max = arg("max") ? Number(arg("max")) : undefined;
  const sourceKeys = arg("source")?.split(",");

  const summary = await runPipeline({ ai: getAI() }, { trigger: "cli", force: true, maxArticles: max, sourceKeys });
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
