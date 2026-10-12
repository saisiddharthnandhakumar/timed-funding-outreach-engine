/**
 * Turns joined database rows into what the scout actually reads: an “opportunity”.
 *
 * Pure (no DB, no React) so the rules are unit-tested. Nothing here is invented: “why now” and
 * “recommended angle” are composed from stored facts (round, investors, assessment signals, research
 * profile). There is no priority score in the product, so ordering uses fit and recency.
 */
import { formatAmount, stageLabel, timeAgo } from "@/lib/format";

export type OppFilter = "all" | "new" | "draft_ready" | "reviewed";
export const OPP_FILTERS: { value: OppFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "new", label: "New" },
  { value: "draft_ready", label: "Draft ready" },
  { value: "reviewed", label: "Reviewed" },
];

/** A human has acted on the draft (approved / sent / rejected / cancelled). */
const REVIEWED_STATUSES = ["approved", "sent", "rejected", "cancelled"];
/** A draft exists and is waiting for the scout. */
const NEEDS_REVIEW_STATUSES = ["generated", "draft_created"];
/** “New” = arrived in the last 24 h and nobody has acted on it yet. */
export const NEW_WINDOW_HOURS = 24;

export interface RawOpportunityRow {
  startupId: string;
  assessment: {
    total_score: number;
    positive_signals: string[] | null;
    concerns: string[] | null;
    reasoning: string | null;
    assessed_at: string;
    thesis_version: number;
  };
  startup: {
    name: string;
    description: string | null;
    sector: string | null;
    subsector: string | null;
    hq_city: string | null;
    hq_country: string | null;
    website: string | null;
    domain: string | null;
    business_model: string | null;
    enrichment_status: string | null;
    contact_status?: string | null;
    profile_json?: { product?: string | null } | null;
  };
  round: {
    id?: string;
    stage: string | null;
    amount: number | string | null;
    currency: string | null;
    earliest_source_published_at: string | null;
    announcement_date?: string | null;
    created_at?: string | null;
    investors?: { name: string; lead: boolean }[];
    sources?: string[];
  };
  outreach: { id: string; status: string; recipient_email: string | null } | null;
}

export type WorkState = "new" | "draft_ready" | "reviewed" | "waiting";

export interface Opportunity {
  id: string;
  name: string;
  description: string | null;
  sector: string | null;
  subsector: string | null;
  city: string | null;
  country: string | null;
  location: string | null;
  website: string | null;
  businessModel: string | null;
  stage: string | null;
  stageLabel: string;
  amount: number | null;
  currency: string | null;
  fundingLabel: string;
  announcedAt: string | null;
  announcedAgo: string;
  investors: { name: string; lead: boolean }[];
  publications: string[];
  fit: number;
  fitLabel: FitLabel;
  reasons: string[];
  concerns: string[];
  assessedAt: string;
  thesisVersion: number;
  whyNow: string;
  angle: string | null;
  draftId: string | null;
  draftStatus: string | null;
  recipientEmail: string | null;
  /** Filter bucket(s): see `matchesFilter`. */
  workState: WorkState;
  isNew: boolean;
}

export type FitLabel = "Strong fit" | "Good fit" | "Possible fit";

export function fitLabel(score: number): FitLabel {
  return score >= 85 ? "Strong fit" : score >= 70 ? "Good fit" : "Possible fit";
}

const lowerFirst = (s: string) => (s.length > 1 && /[a-z]/.test(s[1]) ? s[0].toLowerCase() + s.slice(1) : s);
const stripEnd = (s: string) => s.trim().replace(/[.\s]+$/, "");

/**
 * Why act now, in one short sentence, from facts that are NOT already in the funding line
 * (stage · amount · age): who backed it and how much of the thesis’ announcement window is left.
 * “Led by Accel. 22h left in your 24h window.”
 */
export function whyNow(args: { announcedAt: string | null; investors?: { name: string; lead: boolean }[]; maxAgeHours?: number; now?: Date }): string {
  const inv = args.investors ?? [];
  const lead = inv.find((i) => i.lead) ?? null;
  const backers = lead ? `Led by ${lead.name}` : inv.length ? `Backed by ${inv.slice(0, 2).map((i) => i.name).join(" and ")}` : null;
  let timing: string;
  if (args.announcedAt && args.maxAgeHours) {
    const left = windowHoursLeft(args.announcedAt, args.maxAgeHours, args.now);
    timing = left != null ? `${left}h left in your ${args.maxAgeHours}h window` : `Past your ${args.maxAgeHours}h announcement window`;
  } else {
    timing = "Fresh announcement";
  }
  return `${backers ? `${backers}. ` : ""}${timing}.`;
}

/** The strongest fit signal(s) from the assessment, or the product line from research. */
export function recommendedAngle(signals: string[] | null | undefined, product?: string | null): string | null {
  const s = (signals ?? []).map((x) => stripEnd(x)).filter(Boolean);
  if (s.length) return `${s[0]}${s[1] ? `; ${lowerFirst(s[1])}` : ""}`;
  return product ? stripEnd(product) : null;
}

export function workStateOf(draftStatus: string | null | undefined, assessedAt: string, now = new Date()): { state: WorkState; isNew: boolean } {
  const reviewed = !!draftStatus && REVIEWED_STATUSES.includes(draftStatus);
  const needsReview = !!draftStatus && NEEDS_REVIEW_STATUSES.includes(draftStatus);
  const fresh = now.getTime() - new Date(assessedAt).getTime() <= NEW_WINDOW_HOURS * 3_600_000;
  const state: WorkState = reviewed ? "reviewed" : needsReview ? "draft_ready" : "waiting";
  return { state, isNew: !reviewed && fresh };
}

/** Hours an unreviewed opportunity keeps asking for attention on Today (covers a weekend away). */
export const ATTENTION_WINDOW_HOURS = 72;

/** Qualified, nobody has acted on it, and it is recent enough to still matter. */
export function isActionable(o: Pick<Opportunity, "workState" | "assessedAt">, now = new Date()): boolean {
  return o.workState !== "reviewed" && now.getTime() - new Date(o.assessedAt).getTime() <= ATTENTION_WINDOW_HOURS * 3_600_000;
}

export function buildOpportunity(raw: RawOpportunityRow, now = new Date(), maxAgeHours?: number): Opportunity {
  const { startup: s, round: r, assessment: a, outreach: o } = raw;
  const announcedAt = r.earliest_source_published_at ?? (r.announcement_date ? `${r.announcement_date}T00:00:00+05:30` : (r.created_at ?? null));
  const investors = r.investors ?? [];
  const { state, isNew } = workStateOf(o?.status, a.assessed_at, now);
  const reasons = (a.positive_signals ?? []).filter(Boolean);
  const amount = r.amount == null || r.amount === "" ? null : Number(r.amount);
  return {
    id: raw.startupId,
    name: s.name,
    description: s.description,
    sector: s.sector,
    subsector: s.subsector,
    city: s.hq_city,
    country: s.hq_country,
    location: [s.hq_city, s.hq_country && s.hq_country !== "India" ? s.hq_country : null].filter(Boolean).join(", ") || null,
    website: s.website,
    businessModel: s.business_model,
    stage: r.stage,
    stageLabel: stageLabel(r.stage),
    amount,
    currency: r.currency,
    fundingLabel: formatAmount(amount, r.currency),
    announcedAt,
    announcedAgo: announcedAt ? timeAgo(announcedAt, now) : "—",
    investors,
    publications: r.sources ?? [],
    fit: a.total_score,
    fitLabel: fitLabel(a.total_score),
    reasons,
    concerns: (a.concerns ?? []).filter(Boolean),
    assessedAt: a.assessed_at,
    thesisVersion: a.thesis_version,
    whyNow: whyNow({ announcedAt, investors, maxAgeHours, now }),
    angle: recommendedAngle(reasons, s.profile_json?.product),
    draftId: o?.id ?? null,
    draftStatus: o?.status ?? null,
    recipientEmail: o?.recipient_email ?? null,
    workState: state,
    isNew,
  };
}

/** Default order: highest fit first, then the most recently announced. */
export function sortOpportunities<T extends Pick<Opportunity, "fit" | "announcedAt">>(list: T[]): T[] {
  const t = (x: string | null) => (x ? new Date(x).getTime() : 0);
  return [...list].sort((a, b) => b.fit - a.fit || t(b.announcedAt) - t(a.announcedAt));
}

export function matchesFilter(o: Pick<Opportunity, "workState" | "isNew">, f: OppFilter): boolean {
  switch (f) {
    case "new":
      return o.isNew;
    case "draft_ready":
      return o.workState === "draft_ready";
    case "reviewed":
      return o.workState === "reviewed";
    default:
      return true;
  }
}

/* ─── Advanced filters ─────────────────────────────────────────────────────────────────────────── */

export interface AdvancedFilters {
  stage?: string;
  sector?: string;
  location?: string;
  source?: string;
  minFit?: number;
  maxAgeHours?: number;
  funding?: "small" | "mid" | "large" | "undisclosed";
}

/** Approximate INR value, only for bucketing the “funding” filter. Rates are rough and never displayed. */
const INR_PER: Record<string, number> = { INR: 1, USD: 85, EUR: 92, GBP: 107 };
export const FUNDING_BUCKETS: { value: NonNullable<AdvancedFilters["funding"]>; label: string }[] = [
  { value: "small", label: "Under ₹5 Cr" },
  { value: "mid", label: "₹5–25 Cr" },
  { value: "large", label: "Over ₹25 Cr" },
  { value: "undisclosed", label: "Undisclosed" },
];

export function fundingBucket(amount: number | null, currency: string | null): NonNullable<AdvancedFilters["funding"]> {
  const rate = INR_PER[(currency ?? "").toUpperCase()];
  if (amount == null || !rate) return "undisclosed";
  const crores = (amount * rate) / 1e7;
  return crores < 5 ? "small" : crores <= 25 ? "mid" : "large";
}

export function matchesAdvanced(o: Opportunity, f: AdvancedFilters, now = new Date()): boolean {
  if (f.stage && o.stage !== f.stage) return false;
  if (f.sector && o.sector !== f.sector && o.subsector !== f.sector) return false;
  if (f.location && o.city !== f.location) return false;
  if (f.source && !o.publications.includes(f.source)) return false;
  if (f.minFit != null && o.fit < f.minFit) return false;
  if (f.maxAgeHours != null) {
    if (!o.announcedAt) return false;
    if (now.getTime() - new Date(o.announcedAt).getTime() > f.maxAgeHours * 3_600_000) return false;
  }
  if (f.funding && fundingBucket(o.amount, o.currency) !== f.funding) return false;
  return true;
}

export function activeFilterCount(f: AdvancedFilters): number {
  return Object.values(f).filter((v) => v !== undefined && v !== "").length;
}

/** Hours left in the thesis’ announcement window (null if unknown or already closed). */
export function windowHoursLeft(announcedAt: string | null, maxAgeHours: number, now = new Date()): number | null {
  if (!announcedAt) return null;
  const left = maxAgeHours - (now.getTime() - new Date(announcedAt).getTime()) / 3_600_000;
  return left > 0 ? Math.round(left) : null;
}

/** Text query over name / sector / location for the in-page search box. */
export function matchesQuery(o: Opportunity, q: string): boolean {
  const needle = q.trim().toLowerCase();
  if (!needle) return true;
  return [o.name, o.sector, o.subsector, o.city, o.description].some((v) => v?.toLowerCase().includes(needle));
}
