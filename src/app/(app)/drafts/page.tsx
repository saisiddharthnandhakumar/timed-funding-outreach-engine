import { draftsData, configured } from "@/lib/queries";
import { Card, PageHeader, ScorePill, SetupNotice, StartupLink, StatusBadge } from "@/components/ui";
import { formatAmount, stageLabel, timeAgo } from "@/lib/format";
import { SendDraftButton } from "@/components/send-draft-button";
import { env } from "@/lib/env";
import { formatFrom, sendConfigProblem } from "@/lib/outreach/send";
import { setDraftStatus, updateDraft } from "./actions";

export const dynamic = "force-dynamic";

const btn = "rounded-md border px-3 py-1.5 text-xs font-medium";

export default async function DraftsPage() {
  if (!configured()) return <SetupNotice message="Supabase is not configured." />;
  const drafts = await draftsData();
  const e = env();
  const sendConfig = { apiKey: e.RESEND_API_KEY, fromEmail: e.RESEND_FROM_EMAIL, fromName: e.RESEND_FROM_NAME ?? e.OUTREACH_SENDER_NAME, replyTo: e.RESEND_REPLY_TO };
  const configProblem = sendConfigProblem(sendConfig);
  return (
    <>
      <PageHeader title="Drafts" subtitle="Personalised emails prepared for your review. Nothing is ever sent automatically. Approve and review a draft, then click Send yourself (or send it from your own mail client and mark it as sent)." />
      {drafts.length === 0 && <p className="text-sm text-slate-500">No drafts yet.</p>}
      <div className="space-y-5">
        {drafts.map((d) => {
          const editable = ["generated", "draft_created", "approved"].includes(d.status);
          return (
            <Card key={d.id}>
              <div className="mb-3 flex flex-wrap items-center gap-3 text-sm">
                <StartupLink id={d.startups.id} name={d.startups.name} />
                <span className="text-slate-500">{stageLabel(d.funding_rounds?.stage)} · {formatAmount(d.funding_rounds?.amount, d.funding_rounds?.currency)}</span>
                <ScorePill score={d.fit_assessments?.total_score} />
                <StatusBadge status={d.status} />
                <span className="text-xs text-slate-400">{d.draft_provider === "gmail" ? "Gmail draft" : "stored in app only"} · {timeAgo(d.created_at)}</span>
              </div>
              <form action={updateDraft} className="space-y-3">
                <input type="hidden" name="id" value={d.id} />
                <div className="grid gap-3 sm:grid-cols-2">
                  <input name="recipient_name" defaultValue={d.recipient_name ?? ""} placeholder="Recipient name" disabled={!editable} className="rounded-md border border-slate-300 px-3 py-2 text-sm disabled:bg-slate-50" />
                  <input name="recipient_email" defaultValue={d.recipient_email ?? ""} placeholder="Recipient email (add before sending)" disabled={!editable} className="rounded-md border border-slate-300 px-3 py-2 text-sm disabled:bg-slate-50" />
                </div>
                <input name="subject" defaultValue={d.subject} disabled={!editable} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm font-medium disabled:bg-slate-50" />
                <textarea name="body" defaultValue={d.body} rows={11} disabled={!editable} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm leading-relaxed disabled:bg-slate-50" />
                {editable && <button className={`${btn} border-slate-300 text-slate-700 hover:bg-slate-50`}>Save edits</button>}
              </form>
              {d.status === "sent" && d.sent_at && <p className="mt-3 border-t border-slate-100 pt-3 text-xs text-slate-500">Sent {timeAgo(d.sent_at)}{d.recipient_email ? ` to ${d.recipient_email}` : ""}.</p>}
              {d.status !== "sent" && d.status !== "rejected" && d.status !== "cancelled" && (
                <div className="mt-3 flex flex-wrap gap-2 border-t border-slate-100 pt-3">
                  {d.status !== "approved" && <form action={setDraftStatus}><input type="hidden" name="id" value={d.id} /><input type="hidden" name="to" value="approved" /><button className={`${btn} border-emerald-300 bg-emerald-50 text-emerald-800`}>Approve</button></form>}
                  <SendDraftButton
                    draftId={d.id}
                    to={d.recipient_email}
                    from={formatFrom(sendConfig)}
                    blockedReason={configProblem ?? (d.status !== "approved" ? "Approve the draft to enable sending." : !d.recipient_email ? "Add a recipient email and save." : null)}
                  />
                  <form action={setDraftStatus}><input type="hidden" name="id" value={d.id} /><input type="hidden" name="to" value="sent" /><button className={`${btn} border-slate-300 text-slate-700`}>Mark as sent (I sent it myself)</button></form>
                  <form action={setDraftStatus}><input type="hidden" name="id" value={d.id} /><input type="hidden" name="to" value="rejected" /><button className={`${btn} border-rose-300 text-rose-700`}>Reject</button></form>
                </div>
              )}
            </Card>
          );
        })}
      </div>
    </>
  );
}
