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
import { attachLinkedInDm } from "@/lib/outreach/linkedin";
import type { StartupProfile } from "@/lib/gemini/schemas";
import { errorMessage } from "@/lib/util/text";
import { classifyArticle } from "@/lib/gemini/tasks";
import type { Classification } from "@/lib/gemini/schemas";
import { SupabaseDedupeRepository } from "@/lib/deduplication/supabase-repo";
import { resolveStartupAndRound } from "@/lib/deduplication/resolve";
import { PipelineLogger } from "./logger";
import { applyInvestorEvidence, linkInvestors } from "./run";
import { InvestorEnricher, entriesToDocs } from "@/lib/investors/enrich";

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
  if (!["rejected", "discovered", "error"].includes(round.status)) return { ok: false, message: round.status === "qualified" || round.status === "drafted" ? "This startup is already an opportunity." : "This one is already being worked on." };
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
    const entries = await new InvestorEnricher({ log }).gather({ name: startup.name, domain: startup.website ? new URL(startup.website).hostname.replace(/^www\./, "") : null }).catch(() => []);
    const research = await researchStartup(ai, { companyName: startup.name, hqCountry: startup.hq_country, articles: docs, website: startup.website, extraDocs: entriesToDocs(entries) }, log, startup.id);
    if (entries.length) await applyInvestorEvidence(log, startup.id, roundId, research, entries);
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
    await attachLinkedInDm(ai, out.outreachId, { log });
    await log.event("round", roundId, "draft_created", `Draft ${out.status} via ${out.provider} (manual override)`, { outreach_id: out.outreachId });
    return { ok: true, startupId: startup.id, message: `${startup.name} moved to Opportunities with a draft ready.` };
  } catch (err) {
    await db().from("funding_rounds").update({ status: "rejected", last_error: errorMessage(err) }).eq("id", roundId);
    return { ok: false, message: `Couldn’t pursue ${startup.name}: ${errorMessage(err)}` };
  }
}

/**
 * "Pursue anyway" for a filtered-out article that never became a startup (the classifier or a hard filter dropped it
 * first). Reads the article the way the pipeline does, but takes any named company, then continues as for a round.
 */
export async function overrideFilteredArticle(articleId: string): Promise<OverrideResult> {
  const article = unwrap(
    await db().from("funding_articles").select("id,source_id,source_url,headline,snippet,raw_text,source_published_at,first_seen_at,classification_json,funding_round_id,sources(name)").eq("id", articleId).maybeSingle(),
    "load article",
  ) as
    | { id: string; source_id: string; source_url: string; headline: string; snippet: string | null; raw_text: string | null; source_published_at: string | null; first_seen_at: string; classification_json: Classification | null; funding_round_id: string | null; sources: { name: string } | null }
    | null;
  if (!article) return { ok: false, message: "That article no longer exists." };
  if (article.funding_round_id) return overrideFilteredRound(article.funding_round_id);

  try {
    let c = article.classification_json;
    if (!c) {
      let text = article.raw_text;
      if (!text || text.length < 600) {
        try {
          text = (await fetchPage(article.source_url, 8000)).text;
          await db().from("funding_articles").update({ raw_text: text }).eq("id", article.id);
        } catch {
          /* the headline and snippet are still classified */
        }
      }
      c = await classifyArticle(getAI(), { headline: article.headline, snippet: article.snippet, articleText: text, source: article.sources?.name ?? "unknown", publishedAt: article.source_published_at });
      await db().from("funding_articles").update({ classification_json: c, classification_confidence: c.confidence }).eq("id", article.id);
    }
    if (!c.company_name) return { ok: false, message: "Couldn’t pick out a single startup in this article, so there’s nothing to pursue." };
    if (c.is_roundup) return { ok: false, message: "This article covers several companies. Open it and pursue the specific startup from its own announcement." };

    const announcedAt = new Date(article.source_published_at ?? article.first_seen_at);
    const resolved = await resolveStartupAndRound(new SupabaseDedupeRepository(), {
      company: { name: c.company_name, hqCountry: c.hq_country, hqCity: c.hq_city, description: c.one_line_description },
      round: { stage: c.funding_stage, amount: c.funding_amount, currency: c.funding_currency, announcementDate: announcedAt, publishedAt: article.source_published_at ? new Date(article.source_published_at) : null },
      article: { id: article.id, sourceId: article.source_id, firstSeenAt: new Date(article.first_seen_at) },
    });
    await linkInvestors(resolved.round.id, c);
    await db().from("funding_articles").update({ funding_round_id: resolved.round.id, processing_status: "processed", rejection_reason: null, processed_at: new Date().toISOString() }).eq("id", article.id);
    await new PipelineLogger(null).event("article", article.id, "filter_overridden", `${article.headline}: scout chose to pursue ${resolved.startup.name}`);
    return overrideFilteredRound(resolved.round.id);
  } catch (err) {
    return { ok: false, message: `Couldn’t pursue this article: ${errorMessage(err)}` };
  }
}
