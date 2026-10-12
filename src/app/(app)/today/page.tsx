import type { Metadata } from "next";
import Link from "next/link";
import { OpportunityCard } from "@/components/opportunity";
import { ScanBanner } from "@/components/pipeline-progress";
import { RunPipelineButton } from "@/components/run-pipeline-button";
import { ViewSystemButton } from "@/components/system-status";
import { Callout, EmptyState, PageHeader, Section, SetupNotice, buttonClass } from "@/components/ui";
import { formatToday, greeting, plural } from "@/lib/format";
import { isActionable } from "@/lib/opportunities/derive";
import { opportunitiesData } from "@/lib/opportunities/query";
import { configured, latestRun } from "@/lib/queries";
import { getSystemSummary } from "@/lib/system";

export const metadata: Metadata = { title: "Today" };
export const dynamic = "force-dynamic";

const LIMIT = 6;

export default async function TodayPage() {
  if (!configured()) return <SetupNotice message="Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (see .env.example) and apply the migrations." />;
  const now = new Date();
  const [{ items }, system, run] = await Promise.all([opportunitiesData(now), getSystemSummary(), latestRun()]);

  const actionable = items.filter((o) => isActionable(o, now));
  const shown = actionable.slice(0, LIMIT);
  const drafts = system.draftsToReview;
  const missingRecipient = items.filter((o) => o.draftStatus && ["generated", "draft_created", "approved"].includes(o.draftStatus) && !o.recipientEmail).length;
  const failingSources = system.sources.filter((s) => s.attention);

  return (
    <>
      <PageHeader
        eyebrow={formatToday(now)}
        title={greeting(now)}
        description={
          actionable.length > 0 || drafts > 0 ? (
            <>
              <Link href="/opportunities" className="font-medium text-ink hover:underline">{plural(actionable.length, "opportunity", "opportunities")}</Link> {actionable.length === 1 ? "needs" : "need"} your attention
              {drafts > 0 && <> · <Link href="/drafts" className="font-medium text-ink hover:underline">{plural(drafts, "draft")}</Link> {drafts === 1 ? "is" : "are"} ready to review</>}
            </>
          ) : (
            "Nothing needs your attention right now."
          )
        }
        actions={<RunPipelineButton />}
      />

      <ScanBanner initial={run} />

      {(system.level === "warning" || failingSources.length > 0 || missingRecipient > 0) && (
        <div className="mb-8 space-y-2" aria-label="Needs attention">
          {system.level === "warning" && (
            <Callout tone="negative" title="The scanner needs attention" action={<ViewSystemButton />}>{system.reason}</Callout>
          )}
          {failingSources.slice(0, 2).map((s) => (
            <Callout key={s.id} tone="caution" title={`${s.name} hasn’t been updating`} action={<Link href="/settings/discovery" className={buttonClass("secondary", "sm")}>View issue</Link>}>
              {s.detail}
            </Callout>
          ))}
          {missingRecipient > 0 && (
            <Callout tone="info" title={`${plural(missingRecipient, "draft")} ${missingRecipient === 1 ? "has" : "have"} no recipient email yet`} action={<Link href="/drafts" className={buttonClass("secondary", "sm")}>Open drafts</Link>}>
              No published founder or company address was found. Add one before sending.
            </Callout>
          )}
        </div>
      )}

      {shown.length > 0 ? (
        <Section title="Priority opportunities" aside="Highest fit first, then newest">
          <ol className="divide-y divide-line border-y border-line">
            {shown.map((o, i) => (
              <li key={o.id}><OpportunityCard o={o} rank={i + 1} /></li>
            ))}
          </ol>
          {actionable.length > LIMIT && (
            <p className="mt-4 text-meta">
              <Link href="/opportunities?f=new" className="font-medium text-accent hover:underline">See all {actionable.length} opportunities →</Link>
            </p>
          )}
        </Section>
      ) : items.length === 0 && !system.lastSuccessAt ? (
        <EmptyState title="Nothing here yet" action={<RunPipelineButton variant="primary" label="Run the first scan" />}>
          Run a scan to find recent funding announcements and see which ones fit your thesis.
        </EmptyState>
      ) : (
        <EmptyState
          title="You’re caught up"
          action={items.length > 0 ? <Link href="/opportunities" className={buttonClass("secondary")}>See all opportunities</Link> : undefined}
        >
          No new startups currently meet your thesis.{system.lastScanAgo && <span className="mt-1 block text-meta text-ink-3">Last scan {system.lastScanAgo} ago</span>}
        </EmptyState>
      )}
    </>
  );
}
