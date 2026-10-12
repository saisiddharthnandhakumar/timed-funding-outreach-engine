"use client";

import { useState, useTransition } from "react";
import { createLinkedInDm } from "@/app/(app)/drafts/actions";
import { CopyButton } from "./copy-button";
import { btn } from "./ui";

/** LinkedIn cold-DM fallback for when there is no email. LinkedIn forbids automated messaging, so this is copy-and-send by hand. */
export function LinkedInDm({ draftId, hasEmail, url, recipient, role, message }: { draftId: string; hasEmail: boolean; url: string | null; recipient: string | null; role: string | null; message: string | null }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const find = () => start(async () => { const r = await createLinkedInDm(draftId); setError(r.ok ? null : r.message); });

  if (!message && hasEmail) return null; // an email recipient exists, so no fallback is needed

  return (
    <section aria-labelledby="li-h" className="mt-8 rounded-xl border border-line bg-surface p-5 sm:p-6">
      <h2 id="li-h" className="text-base font-semibold text-ink">LinkedIn DM</h2>
      {message ? (
        <>
          <p className="mt-1 text-sm text-muted">
            {hasEmail ? "A second way in." : "No reliable email was found, so reach out here instead."}{" "}
            {recipient && <>To <span className="font-medium text-ink">{recipient}</span>{role ? `, ${role}` : ""}. </>}
            Check it’s the right person before sending.
          </p>
          <p className="mt-4 whitespace-pre-wrap rounded-lg bg-sunken p-4 text-[0.95rem] leading-relaxed text-ink">{message}</p>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <CopyButton value={message} label="Copy message" variant="button" />
            {url && <a href={url} target="_blank" rel="noopener noreferrer" className={btn.secondary}>Open LinkedIn profile</a>}
            <span className="num text-xs text-faint">{message.length} characters</span>
            <button type="button" onClick={find} disabled={pending} className="text-sm font-medium text-muted hover:text-ink hover:underline disabled:opacity-60">{pending ? "Looking…" : "Search again"}</button>
          </div>
        </>
      ) : (
        <>
          <p className="mt-1 text-sm text-muted">No email recipient yet. Find a founder or team member on LinkedIn and draft a short DM to send by hand.</p>
          <div className="mt-3"><button type="button" onClick={find} disabled={pending} className={btn.secondary}>{pending ? "Searching… (up to a minute)" : "Find LinkedIn contact"}</button></div>
        </>
      )}
      {error && <p role="alert" className="mt-3 text-sm text-bad">{error}</p>}
    </section>
  );
}
