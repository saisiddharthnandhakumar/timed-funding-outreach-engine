import { dashboardData, configured } from "@/lib/queries";
import { Badge, Card, PageHeader, SetupNotice, Stat, StatusBadge } from "@/components/ui";
import { RunPipelineButton } from "@/components/run-pipeline-button";
import { PipelineProgress, type RunView } from "@/components/pipeline-progress";
import { formatDateTime, formatDelay, timeAgo } from "@/lib/format";
import { EXPECTED_CADENCE_MINUTES } from "@/lib/pipeline/health";

export const dynamic = "force-dynamic";

export default async function Dashboard() {
  if (!configured()) return <SetupNotice message="Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (see .env.example) and apply the migrations." />;
  const d = await dashboardData();
  const last = d.runs[0] as Record<string, any> | undefined;
  return (
    <>
      <PageHeader title="Dashboard" subtitle="Last 24 hours of live funding-news ingestion and outreach preparation." actions={<RunPipelineButton />} />
      <div className="mb-6">
        <Card title="Pipeline progress">
          <PipelineProgress initial={(last as RunView | undefined) ?? null} />
        </Card>
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6">
        <Stat label="Articles found" value={d.articles} hint="first seen, 24h" />
        <Stat label="Funding events" value={d.events} hint="Indian pre-seed/seed candidates" />
        <Stat label="Qualified" value={d.qualified} hint="score ≥ threshold" />
        <Stat label="Rejected" value={d.rejected} hint="below threshold / filters" />
        <Stat label="Drafts" value={d.drafts} hint="awaiting your review" />
        <Stat label="Avg ingestion delay" value={formatDelay(d.avgDelay)} hint="first seen − published" />
      </div>

      <div className="mt-6">
        <Card title="Pipeline health">
          <div className="space-y-3 text-sm">
            <div className="flex flex-wrap items-center gap-3">
              <Badge tone={d.health.level === "healthy" ? "green" : d.health.level === "delayed" ? "amber" : "red"}>{d.health.label}</Badge>
              <span className="text-slate-600">{d.health.reason}</span>
              {d.health.running && <Badge tone="blue">run in progress</Badge>}
            </div>
            <dl className="grid grid-cols-2 gap-2 text-slate-600 md:grid-cols-3">
              <div>
                <dt className="text-xs text-slate-400">Last successful run</dt>
                <dd>{d.health.lastSuccess ? formatDateTime(d.health.lastSuccess.completed_at ?? d.health.lastSuccess.started_at) : "never"}</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-400">Time since last success</dt>
                <dd>{d.health.minutesSinceSuccess == null ? "—" : d.health.minutesSinceSuccess < 90 ? `${d.health.minutesSinceSuccess} min` : `${(d.health.minutesSinceSuccess / 60).toFixed(1)} h`}</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-400">Expected cadence</dt>
                <dd>about every {EXPECTED_CADENCE_MINUTES / 60} hours (GitHub Actions) + daily Vercel run</dd>
              </div>
            </dl>
            {d.health.latestFailure && (
              <div className="rounded-md bg-rose-50 p-3 text-xs text-rose-800">
                <b>Latest failure</b> · {timeAgo(d.health.latestFailure.run.started_at)} ({formatDateTime(d.health.latestFailure.run.started_at)}, {d.health.latestFailure.run.trigger} run): {d.health.latestFailure.message}
              </div>
            )}
          </div>
        </Card>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card title="Pipeline status">
          {last ? (
            <div className="space-y-3 text-sm">
              <div className="flex items-center gap-3">
                <StatusBadge status={last.status} />
                <span className="text-slate-500">
                  {last.trigger} run · started {timeAgo(last.started_at)} ({formatDateTime(last.started_at)})
                </span>
              </div>
              <dl className="grid grid-cols-3 gap-2 text-slate-600">
                <div><dt className="text-xs text-slate-400">Sources polled</dt><dd>{last.sources_polled}</dd></div>
                <div><dt className="text-xs text-slate-400">Articles new / found</dt><dd>{last.articles_new} / {last.articles_found}</dd></div>
                <div><dt className="text-xs text-slate-400">AI-processed</dt><dd>{last.articles_processed}</dd></div>
                <div><dt className="text-xs text-slate-400">Funding events</dt><dd>{last.funding_events_found}</dd></div>
                <div><dt className="text-xs text-slate-400">Qualified</dt><dd>{last.qualified_startups}</dd></div>
                <div><dt className="text-xs text-slate-400">Drafts</dt><dd>{last.drafts_generated}</dd></div>
              </dl>
              {Array.isArray(last.errors_json) && last.errors_json.length > 0 && (
                <ul className="space-y-1 rounded-md bg-amber-50 p-3 text-xs text-amber-800">
                  {last.errors_json.slice(0, 5).map((e: { scope: string; message: string }, i: number) => (
                    <li key={i}><b>{e.scope}</b>: {e.message}</li>
                  ))}
                </ul>
              )}
            </div>
          ) : (
            <p className="text-sm text-slate-500">No pipeline run yet. Click “Run pipeline now” or call the cron endpoint.</p>
          )}
        </Card>
        <Card title="Recent pipeline events">
          <ul className="space-y-2 text-sm">
            {d.recentEvents.length === 0 && <li className="text-slate-400">No events yet.</li>}
            {d.recentEvents.map((e: Record<string, any>) => (
              <li key={e.id} className="flex gap-3">
                <span className="w-16 shrink-0 text-xs text-slate-400">{timeAgo(e.created_at)}</span>
                <span className="text-slate-700"><span className="font-medium">{e.event_type}</span> — {e.message}</span>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </>
  );
}
