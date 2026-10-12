"use client";

import { useState, useTransition } from "react";
import { setDraftStatus } from "@/app/(app)/drafts/actions";
import { ActionMenu } from "./action-menu";
import { ConfirmDialog } from "./confirm-dialog";
import { CopyButton } from "./copy-button";
import { SendDraftButton } from "./send-draft-button";
import { btn } from "./ui";

interface Props {
  draftId: string;
  status: string;
  subject: string;
  body: string;
  to: string | null;
  from: string;
  blockedReason: string | null;
  onEdit: () => void;
  editing: boolean;
}

function transition(id: string, to: string) {
  const fd = new FormData();
  fd.set("id", id);
  fd.set("to", to);
  return setDraftStatus(fd);
}

/** One primary action that follows the draft's state, a quiet Gmail/Copy pair, and the rest in "More". */
export function DraftActions({ draftId, status, subject, body, to, from, blockedReason, onEdit, editing }: Props) {
  const [pending, start] = useTransition();
  const [confirm, setConfirm] = useState<null | "reject" | "sent">(null);
  const open = status === "generated" || status === "draft_created" || status === "approved";
  const gmail = `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(to ?? "")}&su=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;

  const MENU_ID = `draft-menu-${draftId}`;
  const closeConfirm = () => {
    setConfirm(null);
    // The menu panel hides when an item is chosen, so put focus back on its trigger.
    requestAnimationFrame(() => document.getElementById(MENU_ID)?.focus());
  };
  const run = (target: string) => start(async () => { await transition(draftId, target); closeConfirm(); });

  return (
    <div className="flex flex-wrap items-start gap-x-4 gap-y-4">
      {!editing && (status === "generated" || status === "draft_created") && (
        <button type="button" disabled={pending || editing} onClick={() => run("approved")} className={btn.primary}>{pending ? "Approving…" : "Approve draft"}</button>
      )}
      {status === "approved" && <SendDraftButton draftId={draftId} to={to} from={from} subject={subject} blockedReason={editing ? "Save your edits first." : blockedReason} />}

      {open && <button type="button" onClick={onEdit} className={btn.secondary} disabled={editing}>Edit</button>}
      <a href={gmail} target="_blank" rel="noopener noreferrer" className={btn.secondary}>Open in Gmail<span className="sr-only"> (opens in a new tab)</span></a>
      <CopyButton variant="button" value={`Subject: ${subject}\n\n${body}`} label="Copy email" />

      {open && (
        <ActionMenu label="More actions for this draft" align="left" triggerId={MENU_ID}>
          <button type="button" onClick={() => setConfirm("sent")}>Mark as sent (I sent it myself)</button>
          <button type="button" onClick={() => setConfirm("reject")} className="text-bad">Reject draft</button>
        </ActionMenu>
      )}

      <ConfirmDialog open={confirm === "reject"} onCancel={closeConfirm} onConfirm={() => run("rejected")} title="Reject this draft?" confirmLabel="Reject draft" tone="danger" pending={pending}>
        <p>It will be dismissed and won’t be sent. The startup stays in your opportunities.</p>
      </ConfirmDialog>
      <ConfirmDialog open={confirm === "sent"} onCancel={closeConfirm} onConfirm={() => run("sent")} title="Mark as sent?" confirmLabel="Mark as sent" pending={pending}>
        <p>Use this when you emailed them yourself (for example from Gmail). The app only records that it was sent; it doesn’t send anything.</p>
      </ConfirmDialog>
    </div>
  );
}
