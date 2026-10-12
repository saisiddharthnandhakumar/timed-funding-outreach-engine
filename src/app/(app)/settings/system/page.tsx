import Link from "next/link";
import { systemData, configured } from "@/lib/queries";
import { PipelineProgress, type RunView } from "@/components/pipeline-progress";
import { RunPipelineButton } from "@/components/run-pipeline-button";
import { ScanStatus } from "@/components/scan-status";
import { Section, SetupNotice, StatusChip, Table, Td, type Tone } from "@/components/ui";
import { ago, formatDateTime, formatDelay } from "@/lib/format";
import { EXPECTED_CADENCE_MINUTES } from "@/lib/pipeline/health";
import { runStatusLabel } from "@/lib/labels";

export const dynamic = "force-dynamic";

const RUN_TONE: Record<string, Tone> = { completed: "ok", partial: "warn", failed: "bad", running: "accent" };

/** Level 3. The full pipeline view that used to be the home screen. */
export default async function SystemPage() {
  if (!configured()) return <SetupNotice message="Supabase is not configured." />;
  const d = await systemData();
  const last = d.runs[0] as (Record<string, any> & RunView) | undefined;
  const errors = (d.runs as Record<string, any>[]).flatMap((r) => (Array.isArray(r.errors_json) ? r.errors_json.map((e: { scope: string; message: string }) => ({ ...e, at: r.started_at, trigger: r.trigger })) : [])).slice(0, 10);

  return (
    <div className="space-y-10">
      <Section
        title="Scan"
        hint="Runs the whole pipeline now, outside the schedule."
        actions={<RunPipelineButton variant="primary" label="Run pipeline now" />}
      >
        <div className="space-y-3">
          <StatusChip tone={d.health.level === "healthy" ? "ok" : d.health.level === "delayed" ? "warn" : "bad"}>{d.health.text}</StatusChip>
          <p className="text-sm text-muted">{d.health.reason}</p>
          <ScanStatus />
        </div>
      </Section>

      <Section title="Pipeline details" hint="Each stage of the latest run">
        <PipelineProgress initial={(last as RunView | undefined) ?? null} />
      </Section>

      <Section title="Last 24 hours">
        <dl className="flex flex-wrap gap-x-10 gap-y-4">
          {([
            ["Articles found", d.articles],
            ["Funding events", d.events],
            ["Qualified", d.qualified],
            ["Rejected", d.rejected],
            ["Drafts created", d.drafts],
            ["Median ingestion delay (fresh articles)", formatDelay(d.medianDelay)],
          ] as const).map(([k, v]) => (
            <div key={k}><dt className="text-xs font-medium text-faint">{k}</dt><dd className="num mt-0.5 text-xl font-semibold text-ink">{v}</dd></div>
          ))}
        </dl>
        <p className="mt-3 text-xs text-faint">Ingestion delay is the median gap between an article’s publication and the first time we saw it, for articles published in the last 24 hours. Older articles found late (for example when a feed is backfilled) are left out so they don’t distort it.</p>
      </Section>

      <Section title="Scheduler">
        <dl className="grid gap-x-10 gap-y-4 text-sm sm:grid-cols-2">
          <div><dt className="text-xs font-medium text-faint">Vercel cron</dt><dd className="mt-0.5 text-ink">{d.health.schedule.vercel}</dd></div>
          <div><dt className="text-xs font-medium text-faint">GitHub Actions</dt><dd className="mt-0.5 text-ink">{d.health.schedule.github}</dd></div>
          <div><dt className="text-xs font-medium text-faint">Expected cadence</dt><dd className="mt-0.5 text-ink">About every {EXPECTED_CADENCE_MINUTES / 60} hours</dd></div>
          <div><dt className="text-xs font-medium text-faint">Next expected scan</dt><dd className="mt-0.5 text-ink">{d.health.nextExpectedAt ? `Around ${formatDateTime(d.health.nextExpectedAt)}` : "—"}</dd></div>
          <div><dt className="text-xs font-medium text-faint">Last scheduled run</dt><dd className="mt-0.5 text-ink">{d.health.lastScheduledRunAt ? `${ago(d.health.lastScheduledRunAt)} (${d.health.lastScheduledRunStatus})` : "None yet"}</dd></div>
          <div><dt className="text-xs font-medium text-faint">Source diagnostics</dt><dd className="mt-0.5"><Link href="/settings/sources" className="font-medium text-accent hover:underline">Open Sources</Link></dd></div>
        </dl>
      </Section>

      <Section title="Recent runs">
        <Table head={["Started", "Trigger", "Result", "Sources", "Articles new / found", "Processed", "Events", "Qualified", "Drafts"]} empty="No pipeline run yet.">
          {(d.runs as Record<string, any>[]).map((r) => (
            <tr key={r.id}>
              <Td className="whitespace-nowrap">{ago(r.started_at)}<div className="text-xs text-faint">{formatDateTime(r.started_at)}</div></Td>
              <Td>{r.trigger}</Td>
              <Td><StatusChip tone={RUN_TONE[r.status] ?? "neutral"}>{runStatusLabel(r.status)}</StatusChip></Td>
              <Td className="num">{r.sources_polled}</Td>
              <Td className="num">{r.articles_new} / {r.articles_found}</Td>
              <Td className="num">{r.articles_processed}</Td>
              <Td className="num">{r.funding_events_found}</Td>
              <Td className="num">{r.qualified_startups}</Td>
              <Td className="num">{r.drafts_generated}</Td>
            </tr>
          ))}
        </Table>
      </Section>

      <Section title="Recent errors">
        {errors.length === 0 ? <p className="text-sm text-muted">No errors in recent runs.</p> : (
          <ul className="space-y-2 text-sm">
            {errors.map((e, i) => <li key={i} className="rounded-lg bg-warn-soft p-3"><b>{e.scope}</b>: {e.message}<span className="block text-xs text-faint">{ago(e.at)} · {e.trigger} run</span></li>)}
          </ul>
        )}
      </Section>

      <Section title="Pipeline event history">
        {d.recentEvents.length === 0 ? <p className="text-sm text-muted">No events yet.</p> : (
          <ul className="space-y-2 text-sm">
            {(d.recentEvents as Record<string, any>[]).map((e) => (
              <li key={e.id} className="flex gap-3">
                <span className="w-16 shrink-0 text-xs text-faint">{ago(e.created_at)}</span>
                <span className="min-w-0 break-words text-muted"><span className="font-mono text-xs text-ink">{e.event_type}</span> {e.message}</span>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}
