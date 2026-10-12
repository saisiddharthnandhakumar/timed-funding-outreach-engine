import type { Opportunity } from "./model";
import { NEW_WINDOW_HOURS } from "./model";

export const STATUS_FILTERS = ["all", "new", "ready", "reviewed"] as const;
export type StatusFilter = (typeof STATUS_FILTERS)[number];
export const STATUS_FILTER_LABEL: Record<StatusFilter, string> = { all: "All", new: "New", ready: "Draft ready", reviewed: "Reviewed" };

/** Funding-size buckets use an approximate INR value, for bucketing only (never displayed). */
const USD_INR = 85;
export const SIZE_BUCKETS = ["small", "mid", "large"] as const;
export type SizeBucket = (typeof SIZE_BUCKETS)[number];
export const SIZE_LABEL: Record<SizeBucket, string> = { small: "Under ₹5 Cr", mid: "₹5–25 Cr", large: "₹25 Cr and above" };

export const AGE_OPTIONS = [24, 48, 72, 168] as const;
export const AGE_LABEL: Record<number, string> = { 24: "Last 24 hours", 48: "Last 2 days", 72: "Last 3 days", 168: "Last 7 days" };

export const SCORE_OPTIONS = [70, 80, 90] as const;

export interface OpportunityFilters {
  status: StatusFilter;
  stage?: string;
  sector?: string;
  location?: string;
  source?: string;
  size?: SizeBucket;
  maxAgeHours?: number;
  minScore?: number;
}

type Params = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)?.trim() || undefined;
const text = (v: string | string[] | undefined) => {
  const s = one(v);
  return s && s.length <= 80 ? s : undefined;
};

/** Reads filters from URL params, ignoring anything that is not a known value. */
export function parseFilters(p: Params): OpportunityFilters {
  const status = one(p.f);
  const size = one(p.size);
  const age = Number(one(p.age));
  const min = Number(one(p.min));
  return {
    status: (STATUS_FILTERS as readonly string[]).includes(status ?? "") ? (status as StatusFilter) : "all",
    stage: text(p.stage),
    sector: text(p.sector),
    location: text(p.loc),
    source: text(p.src),
    size: (SIZE_BUCKETS as readonly string[]).includes(size ?? "") ? (size as SizeBucket) : undefined,
    maxAgeHours: (AGE_OPTIONS as readonly number[]).includes(age) ? age : undefined,
    minScore: (SCORE_OPTIONS as readonly number[]).includes(min) ? min : undefined,
  };
}

/** Number of advanced (popover) filters in use. The status chips are counted separately. */
export function advancedCount(f: OpportunityFilters): number {
  return [f.stage, f.sector, f.location, f.source, f.size, f.maxAgeHours, f.minScore].filter((v) => v !== undefined).length;
}

const inrEquivalent = (o: Opportunity): number | null => {
  if (o.amount == null || o.amount === "") return null;
  const n = Number(o.amount);
  const cur = (o.currency ?? "").toUpperCase();
  return cur === "INR" ? n : cur === "USD" ? n * USD_INR : null;
};

export function matchesStatus(o: Opportunity, status: StatusFilter, now = new Date()): boolean {
  switch (status) {
    case "all":
      return true;
    case "new":
      return (o.draftState === "none" || o.draftState === "ready") && o.assessedAt != null && now.getTime() - new Date(o.assessedAt).getTime() <= NEW_WINDOW_HOURS * 3_600_000;
    case "ready":
      return o.draftState === "ready";
    case "reviewed":
      return o.draftState === "approved" || o.draftState === "sent" || o.draftState === "rejected";
  }
}

export function applyFilters(list: Opportunity[], f: OpportunityFilters, now = new Date()): Opportunity[] {
  return list.filter((o) => {
    if (!matchesStatus(o, f.status, now)) return false;
    if (f.stage && o.stage !== f.stage) return false;
    if (f.sector && o.sector !== f.sector) return false;
    if (f.location && o.location !== f.location) return false;
    if (f.source && !o.sources.includes(f.source)) return false;
    if (f.minScore != null && (o.fit ?? 0) < f.minScore) return false;
    if (f.maxAgeHours != null) {
      if (!o.announcedAt) return false;
      if (now.getTime() - new Date(o.announcedAt).getTime() > f.maxAgeHours * 3_600_000) return false;
    }
    if (f.size) {
      const inr = inrEquivalent(o);
      if (inr == null) return false;
      const cr = inr / 1e7;
      if (f.size === "small" ? cr >= 5 : f.size === "mid" ? cr < 5 || cr >= 25 : cr < 25) return false;
    }
    return true;
  });
}

/** Distinct values present in the data, for the filter dropdowns. */
export function filterOptions(list: Opportunity[]) {
  const uniq = (vals: (string | null)[]) => [...new Set(vals.filter((v): v is string => Boolean(v)))].sort((a, b) => a.localeCompare(b));
  return {
    stages: uniq(list.map((o) => o.stage)),
    sectors: uniq(list.map((o) => o.sector)),
    locations: uniq(list.map((o) => o.location)),
    sources: uniq(list.flatMap((o) => o.sources)),
  };
}
