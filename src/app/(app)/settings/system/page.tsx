import type { Metadata } from "next";
import { PipelineProgress } from "@/components/pipeline-progress";
import { RunPipelineButton } from "@/components/run-pipeline-button";
import { Callout, CompactStat, DetailGroup, DisclosureSection, SetupNotice, StatusLabel } from "@/components/ui";
import { formatDateTime, formatDelay, formatMinutes, timeAgo, timeUntil } from "@/lib/format";
import { runLabel } from "@/lib/labels";
import { configured, dashboardData, latestRun } from "@/lib/queries";
import { getSystemSummary } from "@/lib/system";

export const metadata: Metadata = { title: "System · Settings" };
export const dynamic = "force-dynamic";

export default async function SystemSettingsPage() {
  if (!configured()) return <SetupNotice message="Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (see .env.example) and apply the migrations." />;
  const [d, system, run] = await Promise.all([dashboardData(), getSystemSummary(), latestRun()]);
  const tone = system.level === "healthy" ? "positive" : system.level === "delayed" ? "caution" : system.level === "warning" ? "negative" : "neutral";

  return (
    <div className="space-y-10 pb-16">
      <section>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-heading"><StatusLabel label={{ text: system.level === "healthy" ? "Healthy" : system.level === "delayed" ? "Running late" : system.level === "warning" ? "Needs attention" : "Unavailable", tone }} /></h2>
            <p className="mt-1 text-body text-ink-2">{system.reason}</p>
          </div>
          <RunPipelineButton />
        </div>
        {system.latestFailure && system.level === "warning" && (
          <div className="mt-4">
            <Callout tone="negative" title="Latest problem">
              {system.latestFailure.message}
              <span className="mt-1 block text-ink-3">{timeAgo(system.latestFailure.startedAt)} · {formatDateTime(system.latestFailure.startedAt)} · {system.latestFailure.trigger === "cron" ? "scheduled" : system.latestFailure.trigger} scan</span>
            </Callout>
          </div>
        )}
        <div className="mt-6">
          <DetailGroup
            columns={3}
            items={[
              ["Last successful scan", system.lastSuccessAt ? `${formatDateTime(system.lastSuccessAt)} · ${timeAgo(system.lastSuccessAt)}` : "Never"],
              ["Time since success", system.lastScanAgo ? system.lastScanAgo : null],
              ["Next scheduled scan", system.nextExpectedAt ? `${formatDateTime(system.nextExpectedAt)} · ${timeUntil(system.nextExpectedAt)}` : null],
              ["GitHub Actions", system.schedules.github],
              ["Vercel Cron", system.schedules.vercel],
              ["Last scheduled run", system.lastScheduledAt ? timeAgo(system.lastScheduledAt) : "None recorded"],
            ]}
          />
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-heading">Latest scan</h2>
        <PipelineProgress initial={run} />
      </section>

      <section>
        <h2 className="mb-3 text-heading">Last 24 hours</h2>
        <div className="flex flex-wrap gap-x-8 gap-y-3">
          <CompactStat value={d.articles} label="articles found" />
          <CompactStat value={d.events} label="funding events" />
          <CompactStat value={d.qualified} label="qualified" />
          <CompactStat value={d.rejected} label="rejected" />
          <CompactStat value={d.drafts} label="drafts" />
          <CompactStat value={formatDelay(d.avgDelay)} label="average delay from publication" />
        </div>
      </section>

      <div>
        <DisclosureSection title="Recent scans" summary={`${d.runs.length} shown`} quiet>
          <ul className="divide-y divide-line">
            {(d.runs as Record<string, any>[]).map((r) => (
              <li key={r.id} className="py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <StatusLabel label={runLabel(r.status)} />
                  <span className="text-meta text-ink-3">{r.trigger === "cron" ? "scheduled" : r.trigger} · {timeAgo(r.started_at)} · {formatDateTime(r.started_at)}</span>
                </div>
                <p className="mt-1 text-meta text-ink-2">
                  {r.sources_polled} sources · {r.articles_new} new of {r.articles_found} articles · {r.articles_processed} read by AI · {r.funding_events_found} funding events · {r.qualified_startups} qualified · {r.drafts_generated} drafts
                </p>
                {Array.isArray(r.errors_json) && r.errors_json.length > 0 && (
                  <ul className="mt-2 space-y-1 text-meta text-ink-2">
                    {r.errors_json.slice(0, 5).map((e: { scope: string; message: string }, i: number) => <li key={i}><span className="font-medium text-ink">{e.scope}</span>: {e.message}</li>)}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        </DisclosureSection>
        <DisclosureSection title="Event log" summary="Technical" quiet>
          <ul className="space-y-2">
            {d.recentEvents.length === 0 && <li className="text-meta text-ink-3">No events yet.</li>}
            {d.recentEvents.map((e: Record<string, any>) => (
              <li key={e.id} className="flex gap-3 text-meta">
                <span className="w-16 shrink-0 text-ink-3">{timeAgo(e.created_at)}</span>
                <span className="text-ink-2"><span className="font-medium text-ink">{e.event_type}</span> — {e.message}</span>
              </li>
            ))}
          </ul>
        </DisclosureSection>
        <DisclosureSection title="About these numbers" quiet>
          <p className="max-w-2xl text-meta text-ink-3">
            A scan is considered healthy when one finishes about every {formatMinutes(150)} (the 2-hour schedule plus a grace period). “Running late” means up to 5 hours since the last success; beyond that, or after a failed scan, it needs attention.
          </p>
        </DisclosureSection>
      </div>
    </div>
  );
}
