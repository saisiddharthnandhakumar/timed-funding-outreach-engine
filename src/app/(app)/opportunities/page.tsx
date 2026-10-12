import type { Metadata } from "next";
import Link from "next/link";
import { FilterPopover, FilterSelect } from "@/components/filters";
import { SearchIcon } from "@/components/icons";
import { OpportunityRow } from "@/components/opportunity";
import { SegmentedControl } from "@/components/segmented-control";
import { EmptyState, PageHeader, SetupNotice, buttonClass } from "@/components/ui";
import { stageLabel } from "@/lib/format";
import {
  FUNDING_BUCKETS, OPP_FILTERS, activeFilterCount, matchesAdvanced, matchesFilter, matchesQuery,
  type AdvancedFilters, type OppFilter,
} from "@/lib/opportunities/derive";
import { opportunitiesData } from "@/lib/opportunities/query";
import { configured } from "@/lib/queries";

export const metadata: Metadata = { title: "Opportunities" };
export const dynamic = "force-dynamic";

const PAGE_SIZE = 100;
type Params = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) || undefined;
const num = (v: string | undefined) => (v && Number.isFinite(Number(v)) ? Number(v) : undefined);

const AGE_OPTIONS = [
  { value: "24", label: "Last 24 hours" },
  { value: "48", label: "Last 2 days" },
  { value: "168", label: "Last 7 days" },
];
const MIN_FIT_OPTIONS = [70, 75, 80, 85, 90].map((n) => ({ value: String(n), label: `${n}+` }));

export default async function OpportunitiesPage({ searchParams }: { searchParams: Promise<Params> }) {
  if (!configured()) return <SetupNotice message="Supabase is not configured." />;
  const sp = await searchParams;
  const f = (OPP_FILTERS.some((x) => x.value === one(sp.f)) ? one(sp.f) : "all") as OppFilter;
  const q = one(sp.q) ?? "";
  const adv: AdvancedFilters = {
    stage: one(sp.stage), sector: one(sp.sector), location: one(sp.location), source: one(sp.source),
    minFit: num(one(sp.minFit)), maxAgeHours: num(one(sp.age)),
    funding: FUNDING_BUCKETS.some((b) => b.value === one(sp.funding)) ? (one(sp.funding) as AdvancedFilters["funding"]) : undefined,
  };
  const now = new Date();
  const { items } = await opportunitiesData(now);

  const scoped = items.filter((o) => matchesAdvanced(o, adv, now) && matchesQuery(o, q));
  const counts = Object.fromEntries(OPP_FILTERS.map((x) => [x.value, scoped.filter((o) => matchesFilter(o, x.value)).length])) as Record<OppFilter, number>;
  const list = scoped.filter((o) => matchesFilter(o, f));
  const shown = list.slice(0, PAGE_SIZE);

  const uniq = (xs: (string | null | undefined)[]) => [...new Set(xs.filter((x): x is string => !!x))].sort((a, b) => a.localeCompare(b));
  const stageOptions = uniq(items.map((o) => o.stage)).map((s) => ({ value: s, label: stageLabel(s) }));
  const sectorOptions = uniq(items.flatMap((o) => [o.sector, o.subsector])).map((s) => ({ value: s, label: s }));
  const cityOptions = uniq(items.map((o) => o.city)).map((s) => ({ value: s, label: s }));
  const sourceOptions = uniq(items.flatMap((o) => o.publications)).map((s) => ({ value: s, label: s }));

  /** Keep every other parameter when switching the segment. */
  const hrefFor = (value: OppFilter) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries(sp)) if (k !== "f" && one(v)) p.set(k, one(v)!);
    if (value !== "all") p.set("f", value);
    const s = p.toString();
    return `/opportunities${s ? `?${s}` : ""}`;
  };
  const filtered = activeFilterCount(adv) > 0 || q !== "";

  return (
    <>
      <PageHeader title="Opportunities" description="Startups that match your thesis, strongest fit first." />

      <form method="get" className="mb-6 flex flex-wrap items-center gap-3">
        {f !== "all" && <input type="hidden" name="f" value={f} />}
        <SegmentedControl label="Show" options={OPP_FILTERS.map((x) => ({ ...x, count: counts[x.value] }))} current={f} hrefFor={hrefFor} />
        <div className="ml-auto flex items-center gap-2">
          <label className="relative">
            <span className="sr-only">Search these opportunities</span>
            <SearchIcon className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-3" />
            <input name="q" defaultValue={q} placeholder="Filter by name or sector" className="h-9 w-48 rounded-md border border-control bg-surface pl-8 pr-2.5 text-meta placeholder:text-ink-3 sm:w-60" />
          </label>
          <FilterPopover count={activeFilterCount(adv)}>
            <div className="grid grid-cols-2 gap-3">
              <FilterSelect name="stage" label="Stage" value={adv.stage} options={stageOptions} />
              <FilterSelect name="funding" label="Funding" value={adv.funding} options={FUNDING_BUCKETS} />
              <FilterSelect name="sector" label="Sector" value={adv.sector} options={sectorOptions} />
              <FilterSelect name="location" label="Location" value={adv.location} options={cityOptions} />
              <FilterSelect name="minFit" label="Fit score" value={adv.minFit != null ? String(adv.minFit) : undefined} options={MIN_FIT_OPTIONS} />
              <FilterSelect name="age" label="Announced" value={adv.maxAgeHours != null ? String(adv.maxAgeHours) : undefined} options={AGE_OPTIONS} />
              <div className="col-span-2"><FilterSelect name="source" label="Reported by" value={adv.source} options={sourceOptions} /></div>
            </div>
            <div className="mt-4 flex items-center justify-between">
              <Link href={f === "all" ? "/opportunities" : `/opportunities?f=${f}`} className="text-meta text-ink-2 hover:underline">Reset filters</Link>
              <button className={buttonClass("primary", "sm")}>Apply</button>
            </div>
          </FilterPopover>
        </div>
      </form>

      {shown.length > 0 ? (
        <>
          <ul className="divide-y divide-line border-y border-line" aria-label="Opportunities">
            {shown.map((o) => <OpportunityRow key={o.id} o={o} />)}
          </ul>
          <p className="mt-4 text-meta text-ink-3">
            {list.length > shown.length ? `Showing the top ${shown.length} of ${list.length}.` : `${list.length} ${list.length === 1 ? "opportunity" : "opportunities"}.`}{" "}
            Ordered by fit, then recency.
          </p>
        </>
      ) : filtered || f !== "all" ? (
        <EmptyState title="Nothing matches" action={<Link href="/opportunities" className={buttonClass("secondary")}>Clear filters</Link>}>
          {f === "reviewed" ? "You haven’t approved, sent or rejected a draft yet." : f === "draft_ready" ? "No drafts are waiting for review." : "Try a broader search or remove a filter."}
        </EmptyState>
      ) : (
        <EmptyState title="No opportunities yet">When a funding announcement fits your thesis, it will appear here with a draft ready to review.</EmptyState>
      )}
    </>
  );
}
