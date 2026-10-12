"use client";

import { useShell } from "./shell-provider";

/** The visible entry to search on small screens (the desktop sidebar has none; ⌘K still opens it). */
export function SearchTrigger() {
  const { openSearch } = useShell();
  return (
    <button type="button" onClick={openSearch} aria-label="Search" className="inline-flex h-10 w-10 items-center justify-center rounded-lg text-muted hover:bg-sunken hover:text-ink">
      <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></svg>
    </button>
  );
}
