import Link from "next/link";
import { opportunitiesData, discoveriesData, configured } from "@/lib/queries";
import { PageHeader, SetupNotice, StatusChip, Tag, TextLink, btn, type Tone } from "@/components/ui";
import { EmptyState } from "@/components/empty-state";
import { OpportunityRow } from "@/components/opportunity/opportunity-card";
import { OverrideButton } from "@/components/opportunity/override-button";
import { FilterPopover } from "@/components/opportunity/filter-popover";
import { applyFilters, advancedCount, filterOptions, matchesStatus, parseFilters, STATUS_FILTERS, STATUS_FILTER_LABEL, type OpportunityFilters } from "@/lib/opportunity/filters";
import { ago, formatAmount, formatDateTime, plural, stageLabel } from "@/lib/format";
import { articleStatusLabel, rejectionLabel, roundStatusLabel } from "@/lib/labels";

export const dynamic = "force-dynamic";
export const maxDuration = 300; // "Pursue anyway" researches, scores, searches contacts and drafts in one server action

type Params = Record<string, string | string[] | undefined>;

const href = (params: Record<string, string | number | undefined>) => {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== "") q.set(k, String(v));
  const s = q.toString();
  return s ? `/opportunities?${s}` : "/opportunities";
};

const filterParams = (f: OpportunityFilters) => ({ stage: f.stage, sector: f.sector, loc: f.location, src: f.source, size: f.size, age: f.maxAgeHours, min: f.minScore });

function ViewTabs({ view }: { view: "active" | "discoveries" }) {
  const tab = (id: "active" | "discoveries", label: string, to: string) => (
    <Link key={id} href={to} aria-current={view === id ? "page" : undefined} className={`-mb-px min-h-11 border-b-2 px-1 pb-3 pt-1 text-sm font-medium ${view === id ? "border-accent text-ink" : "border-transparent text-muted hover:text-ink"}`}>
      {label}
    </Link>
  );
  return (
    <nav aria-label="Opportunity views" className="mb-6 flex gap-6 border-b border-line">
      {tab("active", "Active", "/opportunities")}
      {tab("discoveries", "Discoveries", "/opportunities?view=discoveries")}
    </nav>
  );
}

function Chip({ to, current, children }: { to: string; current: boolean; children: React.ReactNode }) {
  return (
    <Link href={to} aria-current={current ? "true" : undefined} className={`inline-flex min-h-9 items-center rounded-full px-3.5 text-sm font-medium ${current ? "bg-ink text-canvas" : "bg-sunken text-muted hover:text-ink"}`}>
      {children}
    </Link>
  );
}

export default async function OpportunitiesPage({ searchParams }: { searchParams: Promise<Params> }) {
  if (!configured()) return <SetupNotice message="Supabase is not configured." />;
  const params = await searchParams;
  const view = params.view === "discoveries" ? "discoveries" : "active";
  return (
    <>
      <PageHeader
        title="Opportunities"
        subtitle={view === "active" ? "Startups that meet your thesis, best fit first." : "Funding announcements the scan found, including ones that didn’t make your thesis."}
      />
      <ViewTabs view={view} />
      {view === "active" ? <ActiveView params={params} /> : <DiscoveriesView params={params} />}
    </>
  );
}

async function ActiveView({ params }: { params: Params }) {
  const all = await opportunitiesData();
  const now = new Date();
  const f = parseFilters(params);
  const advanced = advancedCount(f);
  const list = applyFilters(all, f, now);
  const filtering = advanced > 0 || f.status !== "all";

  return (
    <>
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap gap-2" role="group" aria-label="Filter by status">
          {STATUS_FILTERS.map((s) => {
            const n = all.filter((o) => matchesStatus(o, s, now)).length;
            return (
              <Chip key={s} to={href({ f: s === "all" ? undefined : s, ...filterParams(f) })} current={f.status === s}>
                {STATUS_FILTER_LABEL[s]}
                <span className="num ml-1.5 font-normal">{n}</span>
              </Chip>
            );
          })}
        </div>
        <div className="ml-auto flex items-center gap-3">
          {filtering && <Link href="/opportunities" className="text-sm font-medium text-muted hover:text-ink hover:underline">Clear all</Link>}
          <FilterPopover options={filterOptions(all)} current={f} count={advanced} clearHref={href({ f: f.status === "all" ? undefined : f.status })} />
        </div>
      </div>
      {f.status === "reviewed" ? <p className="mb-6 text-sm text-faint">Reviewed means you’ve approved, sent or dismissed the draft.</p> : <div className="mb-4" />}

      <p role="status" aria-live="polite" className="mb-4 text-sm text-muted">
        {plural(list.length, "opportunity", "opportunities")}
        {filtering ? ` match${list.length === 1 ? "es" : ""} your filters` : ""} · ranked by fit, then newest
      </p>

      {list.length > 0 ? (
        <ul className="divide-y divide-line">
          {list.map((o) => <OpportunityRow key={o.startupId} o={o} now={now} />)}
        </ul>
      ) : all.length === 0 ? (
        <EmptyState title="No qualified startups yet" action={<Link href="/opportunities?view=discoveries" className={btn.secondary}>View discoveries</Link>}>
          <p>Startups that meet your thesis appear here after a scan.</p>
        </EmptyState>
      ) : (
        <EmptyState title="Nothing matches these filters" action={<Link href="/opportunities" className={btn.secondary}>Clear all filters</Link>}>
          <p>Try removing a filter to see more of the {all.length} qualified startups.</p>
        </EmptyState>
      )}
    </>
  );
}

const ROUND_TONE: Record<string, Tone> = { qualified: "ok", drafted: "ok", rejected: "neutral", error: "warn", enriching: "accent", discovered: "accent", scored: "accent" };
const DISCOVERY_FILTERS = [["relevant", "Relevant"], ["filtered", "Filtered"], ["all", "All"]] as const;

async function DiscoveriesView({ params }: { params: Params }) {
  const { rounds, filtered } = await discoveriesData();
  const d = typeof params.d === "string" && DISCOVERY_FILTERS.some(([k]) => k === params.d) ? (params.d as "relevant" | "filtered" | "all") : "relevant";
  const relevant = rounds.filter((r) => r.status !== "rejected");
  const rejectedRounds = rounds.filter((r) => r.status === "rejected");
  const showRelevant = d !== "filtered";
  const showFiltered = d !== "relevant";
  const filteredCount = rejectedRounds.length + filtered.length;
  const now = new Date();

  return (
    <>
      <div className="mb-6 flex flex-wrap gap-2" role="group" aria-label="Show">
        {DISCOVERY_FILTERS.map(([k, label]) => (
          <Chip key={k} to={`/opportunities?view=discoveries${k === "relevant" ? "" : `&d=${k}`}`} current={d === k}>
            {label}
            <span className="num ml-1.5 font-normal">{k === "relevant" ? relevant.length : k === "filtered" ? filteredCount : relevant.length + filteredCount}</span>
          </Chip>
        ))}
      </div>

      {showRelevant && (
        relevant.length === 0 ? (
          <EmptyState title="No new funding announcements found yet"><p>The next scan will look again. Filtered items are under “Filtered”.</p></EmptyState>
        ) : (
          <ul className="divide-y divide-line">
            {relevant.map((r) => (
              <li key={r.id} className="flex flex-wrap items-start justify-between gap-x-6 gap-y-1 py-4 first:pt-0">
                <div className="min-w-0">
                  <TextLink href={`/opportunities/${r.startups.id}`}>{r.startups.name}</TextLink>
                  <p className="mt-0.5 text-sm text-muted">
                    {[r.stage && r.stage !== "unknown" ? stageLabel(r.stage) : null, r.amount != null ? formatAmount(r.amount, r.currency) : null, r.startups.sector, ago(r.earliest_source_published_at, now)].filter(Boolean).join(" · ")}
                  </p>
                  {(r.funding_round_sources ?? []).length > 0 && (
                    <p className="mt-0.5 text-xs text-faint">Reported by {[...new Set((r.funding_round_sources as any[]).map((s) => s.sources?.name).filter(Boolean))].join(", ")}</p>
                  )}
                </div>
                <StatusChip tone={ROUND_TONE[r.status] ?? "neutral"}>{roundStatusLabel(r.status)}</StatusChip>
              </li>
            ))}
          </ul>
        )
      )}

      {showFiltered && (
        <section className={showRelevant ? "mt-12 border-t border-line pt-8" : ""} aria-labelledby="filtered-h">
          <h2 id="filtered-h" className="text-base font-semibold text-ink">Filtered out</h2>
          <p className="mb-4 mt-0.5 text-sm text-faint">Announcements that didn’t pass your thesis, kept for audit. Newest first.</p>
          {filteredCount === 0 ? (
            <p className="text-sm text-muted">Nothing has been filtered yet.</p>
          ) : (
            <ul className="divide-y divide-line">
              {rejectedRounds.map((r) => (
                <li key={r.id} className="flex flex-wrap items-start justify-between gap-x-6 gap-y-1 py-3">
                  <div className="min-w-0">
                    <TextLink href={`/opportunities/${r.startups.id}`}>{r.startups.name}</TextLink>
                    <p className="mt-0.5 text-sm text-muted">{[r.stage && r.stage !== "unknown" ? stageLabel(r.stage) : null, r.amount != null ? formatAmount(r.amount, r.currency) : null, ago(r.earliest_source_published_at, now)].filter(Boolean).join(" · ")}</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-3">
                    <Tag>{rejectionLabel(r.rejection_reason) ?? "Filtered"}</Tag>
                    {r.rejection_reason !== "already_contacted" && <OverrideButton roundId={r.id} />}
                  </div>
                </li>
              ))}
              {filtered.map((a) => (
                <li key={a.id} className="flex flex-wrap items-start justify-between gap-x-6 gap-y-1 py-3">
                  <div className="min-w-0 max-w-xl">
                    <TextLink href={a.source_url} external>{a.headline}</TextLink>
                    <p className="mt-0.5 text-xs text-faint" title={formatDateTime(a.source_published_at)}>{a.sources?.name} · {ago(a.source_published_at ?? a.first_seen_at, now)}</p>
                  </div>
                  <Tag>{rejectionLabel(a.rejection_reason) ?? articleStatusLabel(a.processing_status)}</Tag>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </>
  );
}
