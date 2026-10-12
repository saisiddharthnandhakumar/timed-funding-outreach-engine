"use client";

import { useState, useTransition } from "react";
import { sendDraftEmail } from "@/app/(app)/drafts/actions";
import { ConfirmDialog } from "./confirm-dialog";
import { btn } from "./ui";

/**
 * Sends one approved draft. Always asks for confirmation (To, From, Subject); disabled, with the reason
 * shown as visible text, until it can be sent. The saved version of the draft is what is sent.
 */
export function SendDraftButton({ draftId, to, from, subject, blockedReason }: { draftId: string; to: string | null; from: string; subject: string; blockedReason: string | null }) {
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);

  const confirm = () =>
    start(async () => {
      setResult(await sendDraftEmail(draftId));
      setOpen(false);
    });

  return (
    <div>
      <button type="button" onClick={() => setOpen(true)} disabled={pending || blockedReason != null} className={btn.primary}>
        {pending ? "Sending…" : "Send email"}
      </button>
      <div role="status" className="mt-2 text-sm">
        {blockedReason && !result && <span className="text-muted">{blockedReason}</span>}
        {result && <span className={result.ok ? "text-ok" : "text-bad"}>{result.message}</span>}
      </div>
      <ConfirmDialog open={open} onCancel={() => setOpen(false)} onConfirm={confirm} title="Send this email now?" confirmLabel="Send email" pending={pending}>
        <dl className="grid grid-cols-[4rem_1fr] gap-x-3 gap-y-1">
          <dt className="text-faint">To</dt><dd className="text-ink">{to}</dd>
          <dt className="text-faint">From</dt><dd className="text-ink">{from}</dd>
          <dt className="text-faint">Subject</dt><dd className="text-ink">{subject}</dd>
        </dl>
        <p>The saved version of the draft is sent. This can’t be undone.</p>
      </ConfirmDialog>
    </div>
  );
}
