"use client";

import { useShell } from "./shell-provider";

/** The visible entry to search. ⌘K is a shortcut, never the only way in. */
export function SearchTrigger({ variant }: { variant: "field" | "icon" }) {
  const { openSearch } = useShell();
  if (variant === "icon") {
    return (
      <button type="button" onClick={openSearch} aria-label="Search" className="inline-flex h-10 w-10 items-center justify-center rounded-lg text-muted hover:bg-sunken hover:text-ink">
        <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></svg>
      </button>
    );
  }
  return (
    <button type="button" onClick={openSearch} aria-haspopup="dialog" className="flex h-9 w-full items-center gap-2 rounded-lg border border-line bg-surface px-3 text-sm text-faint hover:border-field">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></svg>
      <span>Search</span>
      <kbd className="ml-auto rounded border border-line px-1.5 text-[11px] text-faint">⌘K</kbd>
    </button>
  );
}
