/**
 * Manually (re)run founder-first contact discovery for startups that were already researched.
 *   npm run contacts -- --startup=<uuid> [--force]
 *   npm run contacts -- --all-qualified [--limit=50] [--force]
 * Free sources only; results are stored in startup_contacts and shown on the startup page.
 */
import { config } from "dotenv";
config({ path: ".env.local" });
config();

async function main() {
  const arg = (name: string) => process.argv.find((a) => a.startsWith(`--${name}=`))?.split("=")[1];
  const flag = (name: string) => process.argv.includes(`--${name}`);
  const { getAI } = await import("../src/lib/ai");
  const { enrichBatch } = await import("../src/lib/contacts");
  const { db } = await import("../src/lib/supabase/admin");

  let ids: string[] = [];
  if (arg("startup")) ids = [arg("startup")!];
  else if (flag("all-qualified")) {
    const limit = Math.min(Number(arg("limit") ?? 50), 50);
    const { data, error } = await db().from("fit_assessments").select("startup_id").eq("qualified", true).order("assessed_at", { ascending: false }).limit(500);
    if (error) throw new Error(error.message);
    ids = [...new Set((data ?? []).map((r) => r.startup_id as string))].slice(0, limit);
  } else {
    console.error("Usage: npm run contacts -- --startup=<uuid> | --all-qualified [--limit=50] [--force]");
    process.exit(1);
  }

  const outcomes = await enrichBatch(getAI(), ids, { force: flag("force") });
  const names = new Map(((await db().from("startups").select("id,name").in("id", ids)).data ?? []).map((s) => [s.id as string, s.name as string]));
  for (const o of outcomes) {
    console.log(`${(names.get(o.startupId) ?? o.startupId).padEnd(28)} ${o.status.padEnd(10)} ${String(o.preferredType ?? "-").padEnd(12)} ${o.preferredEmail ?? "-"}${o.skippedReason ? ` (skipped: ${o.skippedReason})` : ""}`);
    for (const w of o.warnings) console.log(`    · ${w}`);
  }
  process.exit(outcomes.some((o) => o.status === "failed") ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
