"use client";

import { btn } from "@/components/ui";

/** Friendly failure for any page in the app. The technical message is one click away. */
export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div role="alert" className="rounded-xl border border-line px-6 py-12 text-center">
      <h1 className="text-lg font-semibold text-ink">This page couldn’t load</h1>
      <p className="mx-auto mt-2 max-w-md text-[0.95rem] text-muted">Something went wrong while fetching your data. Your work is safe. Try again, and if it keeps happening, check System health in Settings.</p>
      <button type="button" onClick={reset} className={`${btn.primary} mt-5`}>Try again</button>
      <details className="mx-auto mt-6 max-w-xl text-left text-sm text-faint">
        <summary className="cursor-pointer text-center">Technical details</summary>
        <p className="mt-2 break-words font-mono text-xs">{error.message}{error.digest ? ` (ref ${error.digest})` : ""}</p>
      </details>
    </div>
  );
}
