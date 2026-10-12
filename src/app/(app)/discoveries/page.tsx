import type { Metadata } from "next";
import Link from "next/link";
import { ExternalLink } from "@/components/startup-parts";
import { DisclosureSection, EmptyState, PageHeader, SetupNotice, StatusLabel, buttonClass } from "@/components/ui";
import { formatAmount, formatDateTime, stageLabel, timeAgo } from "@/lib/format";
import { articleLabel, roundLabel, sourceShortName } from "@/lib/labels";
import { configured, feedData } from "@/lib/queries";

export const metadata: Metadata = { title: "Discoveries" };
export const dynamic = "force-dynamic";

export default async function DiscoveriesPage({ searchParams }: { searchParams: Promise<{ rejected?: string }> }) {
  if (!configured()) return <SetupNotice message="Supabase is not configured." />;
  const showRejected = (await searchParams).rejected === "1";
  const { rounds, filtered } = await feedData();
  const now = new Date();

  const isRejected = (r: any) => r.status === "rejected";
  const hidden = rounds.filter(isRejected).length;
  const visible = showRejected ? rounds : rounds.filter((r) => !isRejected(r));

  return (
    <>
      <PageHeader
        title="Discoveries"
        description="Every funding announcement we found, including ones that didn’t fit. You rarely need this page: strong fits are already in Opportunities."
        actions={
          hidden > 0 || showRejected ? (
            <Link href={showRejected ? "/discoveries" : "/discoveries?rejected=1"} className={buttonClass(showRejected ? "primary" : "secondary")} scroll={false}>
              {showRejected ? "Hide rejected" : `Show rejected (${hidden})`}
            </Link>
          ) : undefined
        }
      />

      {visible.length === 0 ? (
        <EmptyState title="Nothing discovered yet">Funding announcements from the news sources will show up here after the next scan.</EmptyState>
      ) : (
        <ul className="divide-y divide-line border-y border-line" aria-label="Funding announcements">
          {visible.map((r) => {
            const label = roundLabel(r.status, r.rejection_reason);
            const rejected = isRejected(r);
            const coverage = (r.funding_round_sources ?? []) as any[];
            return (
              <li key={r.id} className={rejected ? "py-4" : "py-5"}>
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <h3 className={rejected ? "text-body text-ink-2" : "text-heading text-ink"}>
                      <Link href={`/opportunities/${r.startups.id}`} className="hover:underline">{r.startups.name}</Link>
                    </h3>
                    <p className="text-meta text-ink-3">
                      {[stageLabel(r.stage), r.amount != null ? formatAmount(r.amount, r.currency) : null, r.earliest_source_published_at ? timeAgo(r.earliest_source_published_at, now) : null, r.startups.sector].filter((x) => x && x !== "—").join(" · ")}
                    </p>
                  </div>
                  <StatusLabel label={label} muted={rejected} title={r.rejection_reason ?? r.status} />
                </div>
                {coverage.length > 0 && (
                  <details className="disclosure mt-2">
                    <summary className="inline-flex items-center gap-1 rounded-md text-meta text-ink-3 hover:text-ink-2">
                      <span className="chev inline-block transition-transform duration-200" aria-hidden="true">›</span>
                      Reported by {coverage.length} {coverage.length === 1 ? "publication" : "publications"}
                    </summary>
                    <ul className="mt-2 space-y-1 pl-4">
                      {coverage.map((s, i) => (
                        <li key={i} className="text-meta text-ink-2">
                          {s.funding_articles?.source_url ? <ExternalLink href={s.funding_articles.source_url}>{sourceShortName(s.sources?.name) || "Article"}</ExternalLink> : (sourceShortName(s.sources?.name) || "Article")}
                          <span className="text-ink-3"> · published {formatDateTime(s.source_published_at)} · first seen {formatDateTime(s.first_seen_at)}</span>
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <div className="mt-10">
        <DisclosureSection title="Articles that didn’t become a funding event" summary={`${filtered.length} most recent`} quiet>
          {filtered.length === 0 ? (
            <p className="text-meta text-ink-3">Nothing has been filtered out yet.</p>
          ) : (
            <ul className="divide-y divide-line">
              {filtered.map((a) => (
                <li key={a.id} className="flex items-start justify-between gap-4 py-3">
                  <div className="min-w-0">
                    <p className="text-body text-ink-2">{a.source_url ? <ExternalLink href={a.source_url}>{a.headline}</ExternalLink> : a.headline}</p>
                    <p className="text-meta text-ink-3">{sourceShortName(a.sources?.name)} · published {formatDateTime(a.source_published_at)} · first seen {formatDateTime(a.first_seen_at)}</p>
                  </div>
                  <StatusLabel label={articleLabel(a.processing_status, a.rejection_reason)} muted title={a.rejection_reason ?? a.processing_status} />
                </li>
              ))}
            </ul>
          )}
        </DisclosureSection>
      </div>
    </>
  );
}
