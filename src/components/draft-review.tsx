"use client";

import { useRef, useState } from "react";
import { updateDraft } from "@/app/(app)/drafts/actions";
import { DraftActions } from "./draft-actions";
import { btn, field } from "./ui";

interface Draft {
  id: string;
  status: string;
  subject: string;
  body: string;
  recipient_name: string | null;
  recipient_email: string | null;
}

const Row = ({ k, children }: { k: string; children: React.ReactNode }) => (
  <div className="grid grid-cols-[4.5rem_1fr] gap-3 border-b border-line py-2.5 text-sm">
    <dt className="text-faint">{k}</dt>
    <dd className="min-w-0 break-words text-ink">{children}</dd>
  </div>
);

/** The email as it will be read, with an Edit mode. Surrounded by nothing but its actions. */
export function DraftReview({ draft, from, blockedReason }: { draft: Draft; from: string; blockedReason: string | null }) {
  const [editing, setEditing] = useState(false);
  const article = useRef<HTMLElement>(null);
  const editable = ["generated", "draft_created", "approved"].includes(draft.status);

  return (
    <div className="space-y-6">
      {editing && editable ? (
        <form
          action={async (fd) => {
            await updateDraft(fd);
            setEditing(false);
            requestAnimationFrame(() => article.current?.focus());
          }}
          className="space-y-4 rounded-xl border border-line bg-surface p-5 sm:p-6"
        >
          <input type="hidden" name="id" value={draft.id} />
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-sm font-medium text-ink">Recipient name<input name="recipient_name" defaultValue={draft.recipient_name ?? ""} className={`${field} mt-1`} /></label>
            <label className="block text-sm font-medium text-ink">Recipient email<input name="recipient_email" type="email" defaultValue={draft.recipient_email ?? ""} placeholder="Add before sending" className={`${field} mt-1`} /></label>
          </div>
          <label className="block text-sm font-medium text-ink">Subject<input name="subject" autoFocus defaultValue={draft.subject} required minLength={3} className={`${field} mt-1`} /></label>
          <label className="block text-sm font-medium text-ink">Message<textarea name="body" defaultValue={draft.body} rows={14} required minLength={20} className={`${field} mt-1 leading-relaxed`} /></label>
          <div className="flex gap-3">
            <button type="submit" className={btn.primary}>Save changes</button>
            <button type="button" onClick={() => setEditing(false)} className={btn.secondary}>Cancel</button>
          </div>
        </form>
      ) : (
        <article ref={article} tabIndex={-1} className="rounded-xl border border-line bg-surface p-5 outline-none sm:p-8">
          <dl>
            <Row k="To">{draft.recipient_name ? <>{draft.recipient_name}{draft.recipient_email && <span className="text-muted"> &lt;{draft.recipient_email}&gt;</span>}</> : draft.recipient_email ?? <span className="text-faint">No recipient yet. Use Edit to add one.</span>}</Row>
            <Row k="Subject"><span className="font-medium">{draft.subject}</span></Row>
          </dl>
          <div className="mt-6 whitespace-pre-wrap text-[1rem] leading-[1.7] text-ink">{draft.body}</div>
        </article>
      )}

      <DraftActions
        draftId={draft.id}
        status={draft.status}
        subject={draft.subject}
        body={draft.body}
        to={draft.recipient_email}
        from={from}
        blockedReason={blockedReason}
        onEdit={() => setEditing(true)}
        editing={editing}
      />
    </div>
  );
}
