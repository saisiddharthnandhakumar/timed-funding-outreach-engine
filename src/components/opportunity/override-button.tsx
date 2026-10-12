"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { pursueFilteredRound } from "@/app/(app)/opportunities/override-actions";
import { btn } from "@/components/ui";

/** Lets the scout pull a filtered-out announcement back in; research, scoring and a draft follow. */
export function OverrideButton({ roundId }: { roundId: string }) {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<{ ok: boolean; message: string; startupId?: string } | null>(null);

  if (result?.ok) {
    return (
      <p role="status" className="text-sm text-ok">
        {result.message}{" "}
        <Link href={`/opportunities/${result.startupId}`} className="font-medium underline">View</Link>
      </p>
    );
  }
  return (
    <div className="flex flex-col items-start gap-1 sm:items-end">
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          if (!window.confirm("Pursue this startup anyway? We’ll research it, find contacts and write a draft, even though it didn’t pass your thesis.")) return;
          start(async () => setResult(await pursueFilteredRound(roundId)));
        }}
        className={btn.secondary}
      >
        {pending ? "Working on it… (up to a minute)" : "Pursue anyway"}
      </button>
      {result && !result.ok && <p role="alert" className="max-w-xs text-xs text-bad sm:text-right">{result.message}</p>}
    </div>
  );
}
