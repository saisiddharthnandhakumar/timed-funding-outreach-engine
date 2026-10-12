"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition, type ReactNode } from "react";
import { changeDraftStatus, sendDraftEmail, updateDraft, type ActionResult } from "@/app/(app)/drafts/actions";
import { gmailComposeUrl } from "@/lib/drafts/checks";
import { CopyButton } from "./copy-button";
import { ConfirmDialog } from "./dialog";
import { ExternalIcon } from "./icons";
import { Menu } from "./menu";
import { draftLabel } from "@/lib/labels";
import { StatusLabel, buttonClass, cx } from "./ui";

export interface DraftView {
  id: string;
  status: string;
  subject: string;
  body: string;
  recipientName: string | null;
  recipientEmail: string | null;
  /** “Sent 2h ago to …”, computed on the server. */
  sentNote: string | null;
}

const EDITABLE = ["generated", "draft_created", "approved"];
const field = "w-full rounded-md border border-control bg-surface px-3 text-body text-ink";

/**
 * The reading surface and the decision, in one place. View mode is a calm email; Edit swaps the
 * text for inputs in place. One primary action at a time: Approve, then Send.
 */
export function DraftWorkspace({ draft, recipientNote, from, sendBlockedReason, children }: { draft: DraftView; recipientNote: string | null; from: string; sendBlockedReason: string | null; children?: ReactNode }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [dialog, setDialog] = useState<null | "send" | "reject" | "sent">(null);
  const [notice, setNotice] = useState<ActionResult | null>(null);
  const [pending, start] = useTransition();
  const editable = EDITABLE.includes(draft.status);
  const needsReview = draft.status === "generated" || draft.status === "draft_created";

  const run = (fn: () => Promise<ActionResult>, after?: (r: ActionResult) => void) =>
    start(async () => {
      const r = await fn();
      setNotice(r);
      setDialog(null);
      after?.(r);
    });

  function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    run(() => updateDraft(fd), (r) => r.ok && setEditing(false));
  }

  const copyText = `Subject: ${draft.subject}\n\n${draft.body}`;
  return (
    <>
      <section aria-label="Email" className="rounded-lg border border-line bg-surface">
        {editing ? (
          <form id="draft-form" onSubmit={save} className="space-y-4 p-6 sm:p-10">
            <input type="hidden" name="id" value={draft.id} />
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block text-label text-ink-2">Recipient name<input name="recipient_name" defaultValue={draft.recipientName ?? ""} className={cx(field, "mt-1 h-10")} autoComplete="off" /></label>
              <label className="block text-label text-ink-2">Recipient email<input name="recipient_email" type="email" defaultValue={draft.recipientEmail ?? ""} placeholder="name@company.com" className={cx(field, "mt-1 h-10")} autoComplete="off" /></label>
            </div>
            <label className="block text-label text-ink-2">Subject<input name="subject" defaultValue={draft.subject} className={cx(field, "mt-1 h-10 font-medium")} /></label>
            <label className="block text-label text-ink-2">Message<textarea name="body" defaultValue={draft.body} rows={14} className={cx(field, "mt-1 py-3 leading-7")} /></label>
          </form>
        ) : (
          <>
            <dl className="space-y-1.5 border-b border-line px-6 py-5 text-meta sm:px-10">
              <div className="flex gap-4">
                <dt className="w-14 shrink-0 text-ink-3">To</dt>
                <dd className="min-w-0 text-ink">
                  {draft.recipientEmail || draft.recipientName ? <>{draft.recipientName}{draft.recipientName && draft.recipientEmail ? " " : ""}{draft.recipientEmail && <span className={draft.recipientName ? "text-ink-2" : ""}>{draft.recipientName ? `<${draft.recipientEmail}>` : draft.recipientEmail}</span>}</> : <span className="text-ink-2">No recipient yet</span>}
                  {recipientNote && <span className="ml-2 text-ink-3">· {recipientNote}</span>}
                </dd>
              </div>
              <div className="flex gap-4"><dt className="w-14 shrink-0 text-ink-3">Subject</dt><dd className="min-w-0 font-medium text-ink">{draft.subject}</dd></div>
            </dl>
            <div className="max-w-[68ch] whitespace-pre-wrap px-6 py-8 text-[1.0625rem] leading-[1.75] text-ink sm:px-10">{draft.body}</div>
          </>
        )}
      </section>

      {children}

      <div className="sticky bottom-[3.75rem] z-10 -mx-4 mt-8 flex flex-wrap items-center gap-2 border-t border-line bg-bg/95 px-4 py-3 backdrop-blur sm:-mx-8 sm:px-8 lg:bottom-0 lg:mx-0 lg:rounded-b-lg lg:px-0">
                <div aria-live="polite" className="w-full text-meta empty:hidden">
          {notice && <p className={notice.ok ? "text-ok" : "text-bad"}>{notice.message}</p>}
          {!notice && draft.status === "approved" && sendBlockedReason && !editing && <p className="text-ink-3">{sendBlockedReason}</p>}
          {!notice && draft.sentNote && <p className="text-ink-2">{draft.sentNote}</p>}
        </div>
        <span className="mr-2"><StatusLabel label={draftLabel(draft.status)} /></span>
        {editing ? (
          <>
            <button type="submit" form="draft-form" disabled={pending} className={buttonClass("primary")}>{pending ? "Saving…" : "Save changes"}</button>
            <button type="button" onClick={() => { setEditing(false); setNotice(null); }} className={buttonClass("secondary")}>Cancel</button>
          </>
        ) : (
          <>
            {needsReview && <button type="button" disabled={pending} onClick={() => run(() => changeDraftStatus(draft.id, "approved"))} className={buttonClass("primary")}>{pending ? "Approving…" : "Approve"}</button>}
            {draft.status === "approved" && <button type="button" disabled={pending || sendBlockedReason != null} onClick={() => setDialog("send")} className={buttonClass("primary")}>Send email</button>}
            {editable && <button type="button" onClick={() => { setEditing(true); setNotice(null); }} className={buttonClass("secondary")}>Edit</button>}
            <CopyButton value={copyText} label="Copy email" variant="secondary" size="md" />
            <a href={gmailComposeUrl({ to: draft.recipientEmail, subject: draft.subject, body: draft.body })} target="_blank" rel="noreferrer noopener" className={buttonClass("secondary")}>
              Open in Gmail <ExternalIcon /><span className="sr-only"> (opens in a new tab)</span>
            </a>
            <span className="ml-auto">
              <Menu
                items={[
                  { label: "Mark as sent (I sent it myself)", onSelect: () => setDialog("sent"), hidden: !editable },
                  { label: "Reject draft", onSelect: () => setDialog("reject"), danger: true, hidden: !editable },
                ]}
              />
            </span>
          </>
        )}
      </div>

      <ConfirmDialog
        open={dialog === "send"}
        onCancel={() => setDialog(null)}
        onConfirm={() => run(() => sendDraftEmail(draft.id))}
        pending={pending}
        title="Send this email now?"
        confirmLabel="Send email"
        description={<>The saved version is sent to <b className="font-medium text-ink">{draft.recipientEmail}</b> from {from}. This can’t be undone.</>}
      />
      <ConfirmDialog
        open={dialog === "sent"}
        onCancel={() => setDialog(null)}
        onConfirm={() => run(() => changeDraftStatus(draft.id, "sent"))}
        pending={pending}
        title="Mark as sent?"
        confirmLabel="Mark as sent"
        description="Use this only if you already sent it yourself from your own mail client. Nothing is sent by this action; it just records that you did."
      />
      <ConfirmDialog
        open={dialog === "reject"}
        onCancel={() => setDialog(null)}
        onConfirm={() => run(() => changeDraftStatus(draft.id, "rejected"), (r) => r.ok && router.replace("/drafts"))}
        pending={pending}
        tone="danger"
        title="Reject this draft?"
        confirmLabel="Reject draft"
        description="It leaves your review queue. The startup stays in Opportunities."
      />
    </>
  );
}
