import Link from "next/link";
import { draftsData, configured } from "@/lib/queries";
import { DraftStatus } from "@/components/opportunity/parts";
import { EmptyState } from "@/components/empty-state";
import { PageHeader, SetupNotice } from "@/components/ui";
import { ago, plural } from "@/lib/format";
import { draftState } from "@/lib/labels";

export const dynamic = "force-dynamic";

const VIEWS = [
  ["review", "To review"],
  ["approved", "Approved"],
  ["done", "Done"],
] as const;
type View = (typeof VIEWS)[number][0];

const viewOf = (status: string): View => {
  const s = draftState(status);
  return s === "ready" ? "review" : s === "approved" ? "approved" : "done";
};

const EMPTY: Record<View, string> = {
  review: "No drafts need review.",
  approved: "No approved drafts are waiting to be sent.",
  done: "Nothing sent or dismissed yet.",
};

export default async function DraftsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  if (!configured()) return <SetupNotice message="Supabase is not configured." />;
  const sp = await searchParams;
  const view: View = VIEWS.some(([k]) => k === sp.s) ? (sp.s as View) : "review";
  const drafts = await draftsData();
  const counts = { review: 0, approved: 0, done: 0 } as Record<View, number>;
  for (const d of drafts) counts[viewOf(d.status)]++;
  const list = drafts.filter((d) => viewOf(d.status) === view);
  const now = new Date();

  return (
    <>
      <PageHeader title="Drafts" subtitle={counts.review > 0 ? `${counts.review} ready for review` : "Nothing is waiting for review"} />
      <nav aria-label="Draft status" className="mb-6 flex gap-6 border-b border-line">
        {VIEWS.map(([k, label]) => (
          <Link key={k} href={k === "review" ? "/drafts" : `/drafts?s=${k}`} aria-current={view === k ? "page" : undefined} className={`-mb-px min-h-11 border-b-2 px-1 pb-3 pt-1 text-sm font-medium ${view === k ? "border-accent text-ink" : "border-transparent text-muted hover:text-ink"}`}>
            {label} <span className="num text-faint">{counts[k]}</span>
          </Link>
        ))}
      </nav>

      {list.length === 0 ? (
        <EmptyState title={EMPTY[view]}>{view === "review" && <p>New drafts are prepared automatically for startups that meet your thesis. Nothing is ever sent without you.</p>}</EmptyState>
      ) : (
        <ul className="divide-y divide-line">
          {list.map((d) => (
            <li key={d.id} className="relative py-5 first:pt-0">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <h2 className="text-[1.05rem] font-semibold tracking-tight text-ink">{d.startups?.name}</h2>
                  <p className="mt-1 text-sm text-muted">{d.recipient_name ? `Founder: ${d.recipient_name}` : "No recipient yet"}</p>
                  <p className="mt-0.5 truncate text-sm text-muted">Subject: {d.subject}</p>
                  <p className="mt-1.5 text-xs text-faint">
                    {draftState(d.status) === "sent" && d.sent_at ? `Sent ${ago(d.sent_at, now)}` : `Generated ${ago(d.created_at, now)}`}
                  </p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-2">
                  <Link href={`/drafts/${d.id}`} className="inline-flex min-h-10 items-center gap-1.5 text-sm font-semibold text-accent after:absolute after:inset-0 after:content-[''] hover:underline">
                    {view === "review" ? "Review" : "Open"} <span aria-hidden="true">→</span>
                    <span className="sr-only"> draft for {d.startups?.name}</span>
                  </Link>
                  {view !== "review" && <DraftStatus state={draftState(d.status)} />}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
      {list.length > 0 && view === "review" && <p className="mt-6 text-sm text-faint">{plural(list.length, "draft")} · newest first</p>}
    </>
  );
}
