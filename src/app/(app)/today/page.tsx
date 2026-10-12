import Link from "next/link";
import { todayData, configured } from "@/lib/queries";
import { parseRange } from "@/lib/ranges";
import { OpportunityCard } from "@/components/opportunity/opportunity-card";
import { SystemHealthLine } from "@/components/shell/system-health";
import { ScanPanel } from "@/components/scan-panel";
import FunnelChartBig from "@/components/ui/funnel-chart-big";
import { SetupNotice, Section, btn } from "@/components/ui";
import { ago, greeting, plural } from "@/lib/format";

export const dynamic = "force-dynamic";

const PRIORITY_LIMIT = 5;
const SCOUT_NAME = "Rohit";

export default async function TodayPage({ searchParams }: { searchParams: Promise<{ range?: string | string[] }> }) {
  if (!configured()) return <SetupNotice message="Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (see .env.example) and apply the migrations." />;
  const range = parseRange((await searchParams).range);
  const d = await todayData(range);
  const now = new Date();
  const n = d.attention.length;
  const shown = d.attention.slice(0, PRIORITY_LIMIT);
  const lastScan = d.health.lastSuccessAt ? ago(d.health.lastSuccessAt, now) : null;

  return (
    <>
      <header className="mb-10">
        <h1 className="text-3xl font-semibold tracking-tight text-ink sm:text-4xl">{n > 0 ? greeting(now, SCOUT_NAME) : "You’re caught up."}</h1>
        {n > 0 ? (
          <div className="mt-3 space-y-0.5 text-lg text-ink sm:text-xl">
            <p>{plural(n, "opportunity", "opportunities")} {n === 1 ? "needs" : "need"} your attention</p>
            {d.draftsReady > 0 && <p className="text-muted">{plural(d.draftsReady, "draft")} {d.draftsReady === 1 ? "is" : "are"} ready</p>}
          </div>
        ) : (
          <div className="mt-3 space-y-0.5 text-lg text-muted sm:text-xl">
            <p>{d.total === 0 ? "No startups currently meet your thesis." : "Every qualified startup has been dealt with."}</p>
            {d.draftsReady > 0 && <p>{plural(d.draftsReady, "draft")} {d.draftsReady === 1 ? "is" : "are"} still waiting for review.</p>}
            <p>{lastScan ? `Last scan ${lastScan}.` : "No scan has completed yet."}</p>
          </div>
        )}
        <div className="mt-4 text-sm"><SystemHealthLine initial={{ level: d.health.level, text: d.health.text }} /></div>
        <div className="mt-6"><ScanPanel /></div>

        {(n > 0 || d.draftsReady > 0 || d.newDiscoveries > 0) && (
        <dl className="mt-8 flex flex-wrap gap-x-10 gap-y-4 border-y border-line py-4">
          {([
            ["Opportunities today", n],
            ["Drafts ready", d.draftsReady],
            ["New discoveries", d.newDiscoveries],
            ["Last scan", lastScan ?? "—"],
          ] as const).map(([label, value]) => (
            <div key={label}>
              <dt className="text-xs font-medium text-faint">{label}</dt>
              <dd className="num mt-0.5 text-xl font-semibold text-ink">{value}</dd>
            </div>
          ))}
        </dl>
        )}
      </header>

      <div className="mb-12"><FunnelChartBig range={range} current={d.funnel.current} previous={d.funnel.previous} /></div>

      {n > 0 ? (
        <Section
          id="priority"
          title="Priority opportunities"
          hint="Ranked by fit, then newest."
          actions={n > shown.length ? <Link href="/opportunities" className="text-sm font-medium text-accent hover:underline">View all {n} →</Link> : undefined}
        >
          <div className="space-y-4">
            {shown.map((o) => <OpportunityCard key={o.startupId} o={o} now={now} />)}
          </div>
          {n <= shown.length && <p className="mt-5 text-sm"><Link href="/opportunities" className="font-medium text-accent hover:underline">See every opportunity →</Link></p>}
        </Section>
      ) : (
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
          {d.draftsReady > 0 && <Link href="/drafts" className={btn.secondary}>Review drafts</Link>}
          <Link href="/opportunities?view=discoveries" className={btn.secondary}>View discoveries</Link>
          {d.total > 0 && <Link href="/opportunities" className="text-sm font-medium text-accent hover:underline">Browse all {d.total} opportunities →</Link>}
        </div>
      )}
    </>
  );
}
