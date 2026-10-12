import { sourcesData, configured } from "@/lib/queries";
import { DisclosureSection } from "@/components/disclosure-section";
import { SetupNotice, StatusChip, btn, type Tone } from "@/components/ui";
import { ago, formatDateTime, formatDelay } from "@/lib/format";
import { SOURCE_LEVEL_LABEL } from "@/lib/pipeline/source-health";
import { toggleSource } from "./actions";

export const dynamic = "force-dynamic";

const TONE: Record<string, Tone> = { healthy: "ok", delayed: "warn", issue: "bad", paused: "neutral", idle: "neutral" };

export default async function SourcesPage() {
  if (!configured()) return <SetupNotice message="Supabase is not configured." />;
  const { sources, articleCounts, metrics, medianDelay } = await sourcesData();
  const healthy = sources.filter((s) => s.level === "healthy").length;
  const now = new Date();

  return (
    <>
      <p className="mb-8 max-w-2xl text-[0.95rem] leading-relaxed text-muted">
        The publications we watch for funding news. {sources.length > 0 && <span className="text-ink">{healthy} of {sources.length} healthy.</span>}
      </p>

      <div>
        {sources.map((s) => {
          const m = metrics.get(s.id)!;
          return (
            <DisclosureSection
              key={s.id}
              title={s.name}
              hint={
                <span className="inline-flex flex-wrap items-center gap-x-3">
                  <StatusChip tone={TONE[s.level]}>{SOURCE_LEVEL_LABEL[s.level as keyof typeof SOURCE_LEVEL_LABEL]}</StatusChip>
                  {s.last_success_at && <span className="text-faint">Last success {ago(s.last_success_at, now)}</span>}
                </span>
              }
            >
              <div className="space-y-5">
                {s.last_error && s.level === "issue" && <p className="rounded-lg bg-bad-soft p-3 text-sm text-ink">{s.last_error}</p>}
                <dl className="grid grid-cols-2 gap-x-8 gap-y-4 text-sm sm:grid-cols-4">
                  <div><dt className="text-xs font-medium text-faint">Last checked</dt><dd className="mt-0.5 text-ink">{ago(s.last_polled_at, now)}</dd></div>
                  <div><dt className="text-xs font-medium text-faint">Last success</dt><dd className="mt-0.5 text-ink">{s.last_success_at ? ago(s.last_success_at, now) : "Never"}</dd></div>
                  <div><dt className="text-xs font-medium text-faint">Articles in last check</dt><dd className="num mt-0.5 text-ink">{s.last_items_found}</dd></div>
                  <div><dt className="text-xs font-medium text-faint">Articles stored</dt><dd className="num mt-0.5 text-ink">{articleCounts.get(s.id) ?? 0}</dd></div>
                </dl>
                <form action={toggleSource}>
                  <input type="hidden" name="id" value={s.id} />
                  <input type="hidden" name="enabled" value={String(!s.enabled)} />
                  <button className={btn.secondary}>{s.enabled ? "Pause this source" : "Resume this source"}</button>
                </form>

                <DisclosureSection title="Technical details" tone="technical">
                  <dl className="grid gap-x-8 gap-y-3 text-xs sm:grid-cols-2">
                    <div><dt className="text-faint">Type</dt><dd className="font-mono text-muted">{s.type}</dd></div>
                    <div><dt className="text-faint">Check interval</dt><dd className="font-mono text-muted">every {s.poll_interval_minutes} min</dd></div>
                    <div className="sm:col-span-2"><dt className="text-faint">Feed</dt><dd className="break-all font-mono text-muted">{s.feed_url ?? s.base_url}</dd></div>
                    <div><dt className="text-faint">Key / ID</dt><dd className="break-all font-mono text-muted">{s.key} · {s.id}</dd></div>
                    <div><dt className="text-faint">Last error</dt><dd className="break-words font-mono text-muted">{s.last_error ? `${s.last_error} (${formatDateTime(s.last_error_at)})` : "None"}</dd></div>
                    <div><dt className="text-faint">Funding reports (14 days)</dt><dd className="num font-mono text-muted">{m.reports}</dd></div>
                    <div><dt className="text-faint">Median ingestion delay (14 days)</dt><dd className="font-mono text-muted">{formatDelay(medianDelay(s.id))}</dd></div>
                    <div><dt className="text-faint">First to publish</dt><dd className="num font-mono text-muted">{m.wins}</dd></div>
                    <div><dt className="text-faint">Only source for an event</dt><dd className="num font-mono text-muted">{m.unique}</dd></div>
                  </dl>
                  <p className="mt-3 text-xs text-faint">Ingestion delay = first seen − published, as a median over articles published in the last 14 days, so a late backfill of old articles doesn’t skew it.</p>
                </DisclosureSection>
              </div>
            </DisclosureSection>
          );
        })}
        <div className="border-t border-line" />
      </div>
    </>
  );
}
