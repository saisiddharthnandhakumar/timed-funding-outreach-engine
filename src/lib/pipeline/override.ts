import { db, unwrap } from "@/lib/supabase/admin";
import { getAI } from "@/lib/ai";
import { fetchPage } from "@/lib/sources/article-text";
import { persistEnrichment, researchStartup } from "@/lib/research/enrich";
import { assessRound } from "@/lib/scoring/assess";
import { loadActiveScoringConfig } from "@/lib/scoring/config";
import { createOutreachDraft } from "@/lib/outreach/generate";
import { SupabaseOutreachLookup } from "@/lib/deduplication/supabase-repo";
import { selectDraftProvider } from "@/lib/outreach/providers";
import { enrichOne } from "@/lib/contacts";
import type { StartupProfile } from "@/lib/gemini/schemas";
import { errorMessage } from "@/lib/util/text";
import { PipelineLogger } from "./logger";

export type OverrideResult = { ok: true; startupId: string; message: string } | { ok: false; message: string };

/**
 * The scout's "pursue anyway" for a funding round the filters rejected: skips the hard filters and the score
 * threshold, runs research, scoring, contact search and drafting exactly as the pipeline would, and records
 * that a person made the call (scoring_snapshot.manual_override) so the audit trail stays honest.
 */
export async function overrideFilteredRound(roundId: string): Promise<OverrideResult> {
  const log = new PipelineLogger(null);
  const ai = getAI();

  const round = unwrap(await db().from("funding_rounds").select("*, startups(*)").eq("id", roundId).maybeSingle(), "load round") as
    | { id: string; startup_id: string; status: string; rejection_reason: string | null; stage: string; amount: number | null; currency: string | null; earliest_source_published_at: string | null; created_at: string; startups: { id: string; name: string; hq_country: string | null; website: string | null } }
    | null;
  if (!round) return { ok: false, message: "That announcement no longer exists." };
  if (round.status !== "rejected") return { ok: false, message: "This one isn’t filtered out any more." };
  if (round.rejection_reason === "already_contacted") return { ok: false, message: "You’ve already contacted this startup, so no second draft was made." };
  const startup = round.startups;

  try {
    const articleRows = unwrap(
      await db().from("funding_round_sources").select("funding_articles(source_url, raw_text, headline, snippet)").eq("funding_round_id", roundId),
      "load round articles",
    ) as unknown as { funding_articles: { source_url: string; raw_text: string | null; headline: string; snippet: string | null } }[];
    const docs = [];
    for (const { funding_articles: fa } of articleRows) {
      let links: { href: string; text: string }[] = [];
      try {
        links = (await fetchPage(fa.source_url, 8000)).links;
      } catch {
        /* the stored text is enough; links only help find the website */
      }
      docs.push({ url: fa.source_url, text: fa.raw_text ?? `${fa.headline}\n${fa.snippet ?? ""}`, links });
    }

    await db().from("funding_rounds").update({ status: "enriching", last_error: null }).eq("id", roundId);
    const research = await researchStartup(ai, { companyName: startup.name, hqCountry: startup.hq_country, articles: docs, website: startup.website }, log, startup.id);
    await persistEnrichment(startup.id, research, log);

    const investorRows = (await db().from("funding_round_investors").select("investors(name)").eq("funding_round_id", roundId)).data as unknown as { investors: { name: string } }[] | null;
    const investors = (investorRows ?? []).map((r) => r.investors.name);
    const amount = round.amount == null ? null : Number(round.amount);
    const { assessment } = await assessRound(ai, {
      startupId: startup.id, roundId, profile: research.profile as StartupProfile, stage: round.stage, amount, currency: round.currency,
      investors, announcedAt: new Date(round.earliest_source_published_at ?? round.created_at),
    });

    // The assessment is what puts a startup on the Opportunities list, so a person's override has to flip it.
    if (!assessment.qualified) {
      const row = unwrap(await db().from("fit_assessments").select("scoring_snapshot").eq("id", assessment.id).single(), "load assessment") as { scoring_snapshot: Record<string, unknown> };
      unwrap(
        await db().from("fit_assessments").update({
          qualified: true,
          scoring_snapshot: { ...row.scoring_snapshot, manual_override: { at: new Date().toISOString(), score: assessment.total_score, original_rejection: round.rejection_reason } },
        }).eq("id", assessment.id),
        "apply override",
      );
    }
    await db().from("funding_rounds").update({ status: "qualified", rejection_reason: null }).eq("id", roundId);
    await log.event("round", roundId, "filter_overridden", `${startup.name}: scout chose to pursue despite "${round.rejection_reason ?? "filtered"}"`, { score: assessment.total_score });

    try {
      await enrichOne(ai, startup.id, { log });
    } catch (err) {
      await log.event("startup", startup.id, "contacts_failed", `${startup.name}: ${errorMessage(err)}`);
    }

    const { thesis } = await loadActiveScoringConfig();
    const out = await createOutreachDraft(ai, new SupabaseOutreachLookup(), selectDraftProvider(), {
      startupId: startup.id, roundId, assessmentId: assessment.id, profile: research.profile as StartupProfile, stage: round.stage,
      amount, currency: round.currency, investors, positiveSignals: assessment.positive_signals, thesisText: thesis.natural_language_thesis,
    });
    if (!out.created) return { ok: true, startupId: startup.id, message: `${startup.name} is now an opportunity, but no draft was made (${out.reason.replace(/_/g, " ")}).` };
    await db().from("funding_rounds").update({ status: "drafted" }).eq("id", roundId);
    await log.event("round", roundId, "draft_created", `Draft ${out.status} via ${out.provider} (manual override)`, { outreach_id: out.outreachId });
    return { ok: true, startupId: startup.id, message: `${startup.name} moved to Opportunities with a draft ready.` };
  } catch (err) {
    await db().from("funding_rounds").update({ status: "rejected", last_error: errorMessage(err) }).eq("id", roundId);
    return { ok: false, message: `Couldn’t pursue ${startup.name}: ${errorMessage(err)}` };
  }
}
