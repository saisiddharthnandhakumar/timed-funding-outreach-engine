import { sourcesData, configured } from "@/lib/queries";
import { DisclosureSection } from "@/components/disclosure-section";
import { SetupNotice, StatusChip, btn, type Tone } from "@/components/ui";
import { ago, formatDateTime, formatDelay } from "@/lib/format";
import { SOURCE_LEVEL_LABEL } from "@/lib/pipeline/source-health";
import { toggleSource } from "./actions";

export const dynamic = "force-dynamic";

const tier = (s: { config_json?: { tier?: string } | null }) => s.config_json?.tier ?? "primary";
const GROUPS = [
  { title: "News sources", hint: "Publications watched for funding announcements.", match: (s: any) => (s.source_type ?? "news") === "news" && tier(s) === "primary" },
  { title: "Investor sources", hint: "Investor websites: new investment posts, plus first-party facts (founders, stage, website) used when researching a startup.", match: (s: any) => s.source_type === "investor" && tier(s) === "primary" },
  { title: "More sources", hint: "Secondary sources, used for verification and context.", match: (s: any) => tier(s) === "secondary" },
];
const ROLE_LABEL = (s: { source_role?: string[] | null }) => {
  const r = s.source_role ?? ["discovery"];
  return r.includes("discovery") && r.includes("enrichment") ? "Finds news + adds detail" : r.includes("discovery") ? "Finds news" : "Adds detail";
};

const TONE: Record<string, Tone> = { healthy: "ok", delayed: "warn", issue: "bad", paused: "neutral", idle: "neutral" };

export default async function SourcesPage() {
  if (!configured()) return <SetupNotice message="Supabase is not configured." />;
  const { sources, articleCounts, metrics, medianDelay } = await sourcesData();
  const usable = sources.filter((s) => s.adapter_status === "verified");
  const healthy = usable.filter((s) => s.level === "healthy").length;
  const now = new Date();

  return (
    <>
      <p className="mb-8 max-w-2xl text-[0.95rem] leading-relaxed text-muted">
        The news publications and investor websites we watch. {usable.length > 0 && <span className="text-ink">{healthy} of {usable.length} healthy.</span>}
      </p>

      {GROUPS.map((g) => {
        const list = sources.filter(g.match);
        if (!list.length) return null;
        return (
          <section key={g.title} className="mb-10" aria-label={g.title}>
            <h2 className="text-base font-semibold text-ink">{g.title}</h2>
            <p className="mb-2 mt-0.5 text-sm text-faint">{g.hint}</p>
            <div>
        {list.map((s) => {
          const m = metrics.get(s.id)!;
          const available = s.adapter_status === "verified";
          return (
            <DisclosureSection
              key={s.id}
              title={s.name}
              hint={
                <span className="inline-flex flex-wrap items-center gap-x-3">
                  {available ? (
                    <StatusChip tone={TONE[s.level]}>{SOURCE_LEVEL_LABEL[s.level as keyof typeof SOURCE_LEVEL_LABEL]}</StatusChip>
                  ) : (
                    <StatusChip tone="neutral">{s.adapter_status === "unsupported" ? "Not available" : "Not verified yet"}</StatusChip>
                  )}
                  {available && <span className="text-faint">{ROLE_LABEL(s)}</span>}
                  {available && s.last_success_at && <span className="text-faint">Last success {ago(s.last_success_at, now)}</span>}
                </span>
              }
            >
              <div className="space-y-5">
                {!available && s.status_note && <p className="rounded-lg bg-sunken p-3 text-sm text-ink">{s.status_note}</p>}
                {available && s.last_error && s.level === "issue" && <p className="rounded-lg bg-bad-soft p-3 text-sm text-ink">{s.last_error}</p>}
                <dl className="grid grid-cols-2 gap-x-8 gap-y-4 text-sm sm:grid-cols-4">
                  <div><dt className="text-xs font-medium text-faint">Last checked</dt><dd className="mt-0.5 text-ink">{ago(s.last_polled_at, now)}</dd></div>
                  <div><dt className="text-xs font-medium text-faint">Last success</dt><dd className="mt-0.5 text-ink">{s.last_success_at ? ago(s.last_success_at, now) : "Never"}</dd></div>
                  <div><dt className="text-xs font-medium text-faint">Articles in last check</dt><dd className="num mt-0.5 text-ink">{s.last_items_found}</dd></div>
                  <div><dt className="text-xs font-medium text-faint">Articles stored</dt><dd className="num mt-0.5 text-ink">{articleCounts.get(s.id) ?? 0}</dd></div>
                </dl>
                {available && (
                  <form action={toggleSource}>
                    <input type="hidden" name="id" value={s.id} />
                    <input type="hidden" name="enabled" value={String(!s.enabled)} />
                    <button className={btn.secondary}>{s.enabled ? "Pause this source" : "Resume this source"}</button>
                  </form>
                )}

                <DisclosureSection title="Technical details" tone="technical">
                  <dl className="grid gap-x-8 gap-y-3 text-xs sm:grid-cols-2">
                    <div><dt className="text-faint">Type</dt><dd className="font-mono text-muted">{s.source_type ?? "news"} · {s.type}</dd></div>
                    <div><dt className="text-faint">Roles</dt><dd className="font-mono text-muted">{(s.source_role ?? ["discovery"]).join(", ")}</dd></div>
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
          </section>
        );
      })}
    </>
  );
}
