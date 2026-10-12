/** Time windows the Today funnel can show. Client-safe: shared by the page, the funnel query and the chart. */
export const RANGES = [
  { key: "24h", short: "24h", hours: 24, label: "24 hours", title: "Last 24 hours", previous: "the 24 hours before" },
  { key: "48h", short: "48h", hours: 48, label: "48 hours", title: "Last 48 hours", previous: "the 48 hours before" },
  { key: "7d", short: "7 days", hours: 168, label: "7 days", title: "Last 7 days", previous: "the 7 days before" },
  { key: "30d", short: "30 days", hours: 720, label: "30 days", title: "Last 30 days", previous: "the 30 days before" },
] as const;
export type RangeKey = (typeof RANGES)[number]["key"];

export function parseRange(v: string | string[] | undefined): RangeKey {
  const k = Array.isArray(v) ? v[0] : v;
  return RANGES.find((r) => r.key === k)?.key ?? "24h";
}

/** The "where the rest dropped out" buckets on Today. Each opens the matching list under Opportunities → Discoveries. */
export const DROP_KINDS = {
  notFunding: { why: "not-funding", label: "Not funding news", reasons: ["not_funding_announcement"] },
  tooOld: { why: "too-old", label: "Older than the time window", reasons: ["announcement_too_old"] },
  outsideThesis: { why: "outside-thesis", label: "Outside your stage or country", reasons: ["wrong_stage", "wrong_geography"] },
  belowScore: { why: "below-score", label: "Below the minimum fit score", reasons: ["below_threshold"] },
} as const;
export type DropKey = keyof typeof DROP_KINDS;

export function parseWhy(v: string | string[] | undefined): DropKey | null {
  const w = Array.isArray(v) ? v[0] : v;
  return (Object.keys(DROP_KINDS) as DropKey[]).find((k) => DROP_KINDS[k].why === w) ?? null;
}

/** Where a "dropped out" row goes: the filtered list for that bucket and time window. */
export const dropHref = (key: DropKey, range: RangeKey) => `/opportunities?view=discoveries&why=${DROP_KINDS[key].why}${range === "24h" ? "" : `&range=${range}`}`;
