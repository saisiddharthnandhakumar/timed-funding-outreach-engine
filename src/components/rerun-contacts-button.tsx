"use client";

import { useState, useTransition } from "react";
import { rerunContactEnrichment } from "@/app/(app)/opportunities/[id]/actions";
import { buttonClass } from "./ui";

export function RerunContactsButton({ startupId }: { startupId: string }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <div className="flex items-center gap-3">
      {msg && <span role="status" className="text-meta text-ink-2">{msg}</span>}
      <button type="button" disabled={pending} onClick={() => start(async () => setMsg((await rerunContactEnrichment(startupId)).message))} className={buttonClass("secondary", "sm")}>
        {pending ? "Searching…" : "Search again"}
      </button>
    </div>
  );
}
