"use client";

import { useState, useTransition } from "react";
import { rerunContactEnrichment } from "@/app/(app)/startups/[id]/actions";

export function RerunContactsButton({ startupId }: { startupId: string }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <div className="flex items-center gap-3">
      {msg && <span className="text-xs text-slate-500">{msg}</span>}
      <button
        type="button"
        disabled={pending}
        onClick={() => start(async () => setMsg((await rerunContactEnrichment(startupId)).message))}
        className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-60"
      >
        {pending ? "Searching…" : "Re-run contact search"}
      </button>
    </div>
  );
}
