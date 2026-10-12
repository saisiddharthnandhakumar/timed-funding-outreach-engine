import type { Metadata } from "next";
import { ExternalLink } from "@/components/startup-parts";
import { Callout, Code, DetailGroup, DisclosureSection, SetupNotice, StatusLabel, buttonClass } from "@/components/ui";
import { formatDateTime, formatDelay, timeAgo } from "@/lib/format";
import { SCHEDULES } from "@/lib/pipeline/schedule";
import { configured, sourcesData } from "@/lib/queries";
import { sourceHealth, type SourceHealthLevel } from "@/lib/sources/health";
import { sourceShortName, type Tone } from "@/lib/labels";
import { toggleSource } from "./actions";

export const metadata: Metadata = { title: "Discovery · Settings" };
export const dynamic = "force-dynamic";

const TONE: Record<SourceHealthLevel, Tone> = { healthy: "positive", delayed: "caution", attention: "negative", paused: "neutral", waiting: "neutral" };

export default async function DiscoverySettingsPage() {
  if (!configured()) return <SetupNotice message="Supabase is not configured." />;
  const { sources, articleCounts, metrics } = await sourcesData();
  const now = new Date();
  const rows = sources.map((s) => ({ s, h: sourceHealth(s, now) }));
  const attention = rows.filter((r) => r.h.level === "attention");

  return (
    <div className="max-w-3xl pb-16">
      <p className="text-body text-ink-2">
        New funding announcements are checked about every 2 hours, around the clock. Each news source below is checked on every scan.
      </p>

      {attention.length > 0 && (
        <div className="mt-6 space-y-2">
          {attention.map(({ s, h }) => <Callout key={s.id} tone="caution" title={`${sourceShortName(s.name)} hasn’t been updating`}>{h.detail}</Callout>)}
        </div>
      )}

      <h2 className="mb-1 mt-10 text-heading">News sources</h2>
      <ul className="divide-y divide-line border-y border-line">
        {rows.map(({ s, h }) => {
          const m = metrics.get(s.id);
          const avg = m && m.delays.length ? m.delays.reduce((a, b) => a + b, 0) / m.delays.length : null;
          return (
            <li key={s.id}>
              <details className="disclosure group">
                <summary className="flex min-h-12 items-center gap-3 py-3">
                  <span className="chev text-ink-3 transition-transform duration-200" aria-hidden="true">›</span>
                  <span className="flex-1 text-body font-medium text-ink">{sourceShortName(s.name)}</span>
                  <StatusLabel label={{ text: h.label, tone: TONE[h.level] }} />
                </summary>
                <div className="pb-5 pl-6">
                  <p className="text-body text-ink-2">{h.detail}</p>
                  <DetailGroup
                    columns={3}
                    items={[
                      ["Last successful check", s.last_success_at ? `${timeAgo(s.last_success_at, now)} · ${formatDateTime(s.last_success_at)}` : "Never"],
                      ["Found in last check", `${s.last_items_found} ${s.last_items_found === 1 ? "article" : "articles"}`],
                      ["Articles collected", articleCounts.get(s.id) ?? 0],
                    ]}
                  />
                  {s.last_error && <p className="mt-4 text-meta text-bad">Latest error: {s.last_error}</p>}
                  <form action={toggleSource} className="mt-4">
                    <input type="hidden" name="id" value={s.id} />
                    <input type="hidden" name="enabled" value={String(!s.enabled)} />
                    <button className={buttonClass(s.enabled ? "secondary" : "primary", "sm")}>{s.enabled ? "Turn off this source" : "Turn on this source"}</button>
                  </form>

                  <DisclosureSection title="Technical details" quiet className="mt-4">
                    <DetailGroup
                      columns={3}
                      items={[
                        ["Full name", s.name],
                        ["Type", s.type],
                        ["Identifier", <Code key="k">{s.key}</Code>],
                        ["Check every", `${s.poll_interval_minutes} min`],
                        ["Last polled", s.last_polled_at ? formatDateTime(s.last_polled_at) : "Never"],
                        ["Feed", s.feed_url ? <ExternalLink key="f" href={s.feed_url} className="break-all">{s.feed_url}</ExternalLink> : null],
                        ["Funding reports", m?.reports ?? 0],
                        ["Average delay", formatDelay(avg)],
                        ["Published first", m?.wins ?? 0],
                        ["Only source", m?.unique ?? 0],
                      ]}
                    />
                    <p className="mt-3 text-meta text-ink-3">Delay is the time between a story being published and us first seeing it. “Published first” counts funding events this source reported before any other. “Only source” counts events no other source covered.</p>
                  </DisclosureSection>
                </div>
              </details>
            </li>
          );
        })}
      </ul>

      <DisclosureSection title="Scan schedule" quiet className="mt-6">
        <DetailGroup
          columns={2}
          items={[
            ["Every 2 hours", `GitHub Actions: ${SCHEDULES.github.label.toLowerCase()} (minute ${SCHEDULES.github.utcMinute} past the even UTC hour)`],
            ["Daily anchor", `Vercel Cron: ${SCHEDULES.vercel.label.toLowerCase()}`],
          ]}
        />
        <p className="mt-3 text-meta text-ink-3">Both call the same protected endpoint. Scans can also be started by hand from Today or from the System page.</p>
      </DisclosureSection>
    </div>
  );
}
