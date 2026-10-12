import Link from "next/link";
import { notFound } from "next/navigation";
import { isUuid } from "@/lib/util/text";
import { draftDetail, configured } from "@/lib/queries";
import { DraftReview } from "@/components/draft-review";
import { DraftStatus } from "@/components/opportunity/parts";
import { SetupNotice, Section } from "@/components/ui";
import { ago, formatAmount } from "@/lib/format";
import { roundPhrase } from "@/lib/opportunity/why";
import { draftState } from "@/lib/labels";
import { env } from "@/lib/env";
import { formatFrom, sendConfigProblem } from "@/lib/outreach/send";
import { buildMessageChecks } from "@/lib/opportunity/why";

export const dynamic = "force-dynamic";

export default async function DraftPage({ params }: { params: Promise<{ id: string }> }) {
  if (!configured()) return <SetupNotice message="Supabase is not configured." />;
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const data = await draftDetail(id);
  if (!data) notFound();
  const { draft: d, preferredContact } = data;

  const e = env();
  const sendConfig = { apiKey: e.RESEND_API_KEY, fromEmail: e.RESEND_FROM_EMAIL, fromName: e.RESEND_FROM_NAME ?? e.OUTREACH_SENDER_NAME, replyTo: e.RESEND_REPLY_TO };
  const configProblem = sendConfigProblem(sendConfig);
  const blockedReason = configProblem ?? (d.status !== "approved" ? "Approve the draft to enable sending." : !d.recipient_email ? "Add a recipient email and save." : null);

  const state = draftState(d.status);
  const checks = buildMessageChecks({
    startupName: d.startups.name,
    stage: d.funding_rounds?.stage ?? null,
    amountText: formatAmount(d.funding_rounds?.amount, d.funding_rounds?.currency),
    recipientName: d.recipient_name,
    recipientEmail: d.recipient_email,
    emailVerification: preferredContact?.email === d.recipient_email ? preferredContact?.verification_status ?? null : null,
    body: d.body,
    signalCount: d.fit_assessments?.positive_signals?.length ?? 0,
  });

  return (
    <>
      <nav aria-label="Breadcrumb" className="mb-6 text-sm"><Link href="/drafts" className="text-muted hover:text-ink hover:underline">← Drafts</Link></nav>
      <header className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight text-ink sm:text-3xl">{d.startups.name}</h1>
        {d.startups.description && <p className="mt-1.5 max-w-2xl text-[0.95rem] text-muted">{d.startups.description}</p>}
        <p className="mt-1 text-sm text-muted">
          {roundPhrase(d.funding_rounds?.stage ?? null, d.funding_rounds?.amount ?? null, d.funding_rounds?.currency ?? null).replace(/^./, (c: string) => c.toUpperCase())}
          {d.fit_assessments?.total_score != null && <> · Fit <span className="num font-medium text-ink">{d.fit_assessments.total_score}</span></>}
          {" · "}<Link href={`/opportunities/${d.startups.id}`} className="font-medium text-accent hover:underline">View startup context</Link>
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted">
          <DraftStatus state={state} />
          <span>{state === "sent" && d.sent_at ? `Sent ${ago(d.sent_at)}${d.recipient_email ? ` to ${d.recipient_email}` : ""}` : `Generated ${ago(d.created_at)}`}</span>
        </div>
      </header>

      <DraftReview draft={d} from={formatFrom(sendConfig)} blockedReason={blockedReason} />

      <div className="mt-10 space-y-8">
        <Section id="why-message" title="Why this message" hint="Checked against the draft text">
          <ul className="space-y-1.5">
            {checks.map((c) => (
              <li key={c.label} className="flex gap-2.5 text-[0.95rem] text-ink">
                <span aria-hidden="true" className={`w-4 shrink-0 text-center ${c.ok ? "text-ok" : "text-faint"}`}>{c.ok ? "✓" : "–"}</span>
                <span>{c.label}<span className="sr-only">{c.ok ? "" : " (not met)"}</span></span>
              </li>
            ))}
          </ul>
        </Section>
      </div>
    </>
  );
}
