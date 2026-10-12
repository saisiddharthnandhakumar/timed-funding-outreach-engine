import { formatAmount } from "@/lib/format";
import { draftState, type DraftState } from "@/lib/labels";
import { buildWhyFit, buildWhyNow, type WhyNow } from "./why";

/** Qualified, announced within this window and with no human decision on the draft yet = "needs attention". */
export const ATTENTION_WINDOW_DAYS = 7;

/** A "new" opportunity was scored in the last two days. */
export const NEW_WINDOW_HOURS = 48;

export interface Opportunity {
  startupId: string;
  name: string;
  description: string | null;
  stage: string | null;
  amount: number | string | null;
  currency: string | null;
  amountText: string;
  location: string | null;
  sector: string | null;
  subsector: string | null;
  announcedAt: string | null;
  assessedAt: string | null;
  fit: number | null;
  signals: string[];
  investors: { name: string; lead: boolean }[];
  sources: string[];
  draftId: string | null;
  draftStatus: string | null;
  draftState: DraftState;
  draftSubject: string | null;
  recipientName: string | null;
  whyNow: WhyNow;
  whyFit: string[];
}

/** Row shape from `opportunitiesData()` (Supabase rows are untyped at this layer). */
export interface OpportunityRow {
  assessment: { total_score: number | null; positive_signals: string[] | null; assessed_at: string | null };
  startup: { id: string; name: string; description: string | null; sector: string | null; subsector: string | null; business_model: string | null; hq_city: string | null; hq_country: string | null };
  round: {
    stage: string | null;
    amount: number | string | null;
    currency: string | null;
    announcement_date?: string | null;
    earliest_source_published_at: string | null;
    funding_round_investors?: { is_lead: boolean | null; investors: { name: string } | null }[] | null;
    funding_round_sources?: { sources: { name: string } | null }[] | null;
  } | null;
  outreach: { id: string; status: string; subject: string | null; recipient_name: string | null } | null;
}

export function toOpportunity(row: OpportunityRow, now = new Date()): Opportunity {
  const { startup, round, assessment, outreach } = row;
  const investors = (round?.funding_round_investors ?? [])
    .filter((i) => i.investors?.name)
    .map((i) => ({ name: i.investors!.name, lead: Boolean(i.is_lead) }));
  const sources = [...new Set((round?.funding_round_sources ?? []).map((s) => s.sources?.name).filter((n): n is string => Boolean(n)))];
  const announcedAt = round?.earliest_source_published_at ?? (round?.announcement_date ? `${round.announcement_date}T00:00:00Z` : null);
  const signals = assessment.positive_signals ?? [];
  return {
    startupId: startup.id,
    name: startup.name,
    description: startup.description,
    stage: round?.stage ?? null,
    amount: round?.amount ?? null,
    currency: round?.currency ?? null,
    amountText: formatAmount(round?.amount, round?.currency),
    location: [startup.hq_city, startup.hq_country].filter(Boolean).join(", ") || null,
    sector: startup.sector,
    subsector: startup.subsector,
    announcedAt,
    assessedAt: assessment.assessed_at,
    fit: assessment.total_score,
    signals,
    investors,
    sources,
    draftId: outreach?.id ?? null,
    draftStatus: outreach?.status ?? null,
    draftState: draftState(outreach?.status),
    draftSubject: outreach?.subject ?? null,
    recipientName: outreach?.recipient_name ?? null,
    whyNow: buildWhyNow({ name: startup.name, stage: round?.stage ?? null, amount: round?.amount ?? null, currency: round?.currency ?? null, announcedAt, investors, now }),
    whyFit: buildWhyFit({ signals, sector: startup.sector, subsector: startup.subsector, businessModel: startup.business_model }, 3),
  };
}

const time = (iso: string | null) => (iso ? new Date(iso).getTime() : -Infinity);

/** Highest fit first, then the freshest announcement. No separate priority score exists. */
export function byPriority(a: Opportunity, b: Opportunity): number {
  return (b.fit ?? -1) - (a.fit ?? -1) || time(b.announcedAt) - time(a.announcedAt);
}

export function needsAttention(o: Opportunity, now = new Date()): boolean {
  if (o.draftState !== "none" && o.draftState !== "ready") return false;
  if (!o.announcedAt) return true;
  return now.getTime() - time(o.announcedAt) <= ATTENTION_WINDOW_DAYS * 86_400_000;
}

/** Fit tier in words, so the score never relies on colour. */
export function fitTier(score: number | null | undefined, minimum = 70): "strong" | "good" | "low" | "none" {
  if (score == null) return "none";
  return score >= 80 ? "strong" : score >= minimum ? "good" : "low";
}
export const FIT_TIER_LABEL = { strong: "Strong fit", good: "Good fit", low: "Below threshold", none: "Not scored" } as const;
