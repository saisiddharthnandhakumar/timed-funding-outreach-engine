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
