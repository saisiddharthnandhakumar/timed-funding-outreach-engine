"use client";

import { useState, useTransition } from "react";
import { sendDraftEmail } from "@/app/(app)/drafts/actions";

/** Sends one approved draft. Always asks for confirmation; disabled (with the reason) until it can be sent. */
export function SendDraftButton({ draftId, to, from, blockedReason }: { draftId: string; to: string | null; from: string; blockedReason: string | null }) {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);

  function send() {
    if (!window.confirm(`Send this email now?\n\nTo: ${to}\nFrom: ${from}\n\nThe saved version of the draft is sent. This cannot be undone.`)) return;
    start(async () => setResult(await sendDraftEmail(draftId)));
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <button
        type="button"
        onClick={send}
        disabled={pending || blockedReason != null}
        title={blockedReason ?? `Send to ${to}`}
        className="rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {pending ? "Sending…" : "Send email"}
      </button>
      {blockedReason && !result && <span className="text-xs text-slate-500">{blockedReason}</span>}
      {result && <span className={`text-xs ${result.ok ? "text-emerald-700" : "text-rose-700"}`}>{result.message}</span>}
    </div>
  );
}
