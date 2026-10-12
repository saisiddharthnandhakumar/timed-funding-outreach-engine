import type { Metadata } from "next";
import Link from "next/link";
import { SegmentedControl } from "@/components/segmented-control";
import { EmptyState, PageHeader, SetupNotice, StatusLabel, buttonClass } from "@/components/ui";
import { formatAmount, stageLabel, timeAgo } from "@/lib/format";
import { draftLabel } from "@/lib/labels";
import { configured, draftsData } from "@/lib/queries";

export const metadata: Metadata = { title: "Drafts" };
export const dynamic = "force-dynamic";

type Filter = "review" | "approved" | "sent" | "all";
const GROUPS: Record<Filter, string[] | null> = { review: ["generated", "draft_created"], approved: ["approved"], sent: ["sent"], all: null };
const OPTIONS: { value: Filter; label: string }[] = [
  { value: "review", label: "To review" },
  { value: "approved", label: "Approved" },
  { value: "sent", label: "Sent" },
  { value: "all", label: "All" },
];

export default async function DraftsPage({ searchParams }: { searchParams: Promise<{ f?: string }> }) {
  if (!configured()) return <SetupNotice message="Supabase is not configured." />;
  const { f: raw } = await searchParams;
  const f: Filter = OPTIONS.some((o) => o.value === raw) ? (raw as Filter) : "review";
  const drafts = await draftsData();
  const now = new Date();

  const inGroup = (status: string, g: Filter) => GROUPS[g] === null || GROUPS[g]!.includes(status);
  const counts = Object.fromEntries(OPTIONS.map((o) => [o.value, drafts.filter((d) => inGroup(d.status, o.value)).length])) as Record<Filter, number>;
  const list = drafts.filter((d) => inGroup(d.status, f));

  return (
    <>
      <PageHeader title="Drafts" description="Personalised emails, ready for your review. Nothing is ever sent without you." />
      <div className="mb-6">
        <SegmentedControl label="Show" options={OPTIONS.map((o) => ({ ...o, count: counts[o.value] }))} current={f} hrefFor={(v) => (v === "review" ? "/drafts" : `/drafts?f=${v}`)} />
      </div>

      {list.length === 0 ? (
        <EmptyState
          title={f === "review" ? "No drafts need review" : "No drafts here"}
          action={f !== "all" && drafts.length > 0 ? <Link href="/drafts?f=all" className={buttonClass("secondary")}>See all drafts</Link> : undefined}
        >
          {f === "review" ? "New drafts appear here after each scan, for startups that fit your thesis." : "Nothing matches this view."}
        </EmptyState>
      ) : (
        <ul className="divide-y divide-line border-y border-line" aria-label="Drafts">
          {list.map((d) => {
            const open = !["sent", "rejected", "cancelled"].includes(d.status);
            return (
              <li key={d.id} className="group relative -mx-4 flex items-start gap-4 rounded-lg px-4 py-4 hover:bg-sunken/70 sm:-mx-5 sm:px-5">
                <div className="min-w-0 flex-1">
                  <h3 className="text-heading text-ink"><Link href={`/drafts/${d.id}`} className="after:absolute after:inset-0 after:rounded-lg">{d.startups?.name ?? "Unknown startup"}</Link></h3>
                  <p className="mt-0.5 truncate text-body text-ink-2">{d.subject}</p>
                  <p className="mt-0.5 text-meta text-ink-3">
                    {d.recipient_email ? <>To {d.recipient_name ? `${d.recipient_name} · ` : ""}{d.recipient_email}</> : open ? <span className="text-ink-2">No recipient email yet</span> : "No recipient"}
                    {" · "}{[stageLabel(d.funding_rounds?.stage), d.funding_rounds?.amount != null ? formatAmount(d.funding_rounds.amount, d.funding_rounds.currency) : null].filter((x) => x && x !== "—").join(" · ")}
                  </p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <StatusLabel label={draftLabel(d.status)} />
                  <span className="text-meta text-ink-3">{d.status === "sent" && d.sent_at ? `Sent ${timeAgo(d.sent_at, now)}` : timeAgo(d.created_at, now)}</span>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
