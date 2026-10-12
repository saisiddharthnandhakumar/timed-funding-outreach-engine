"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { SearchHit } from "@/lib/search";
import { Dialog } from "./dialog";

const MATCH_LABEL = { startup: "Startup", founder: "Founder", sector: "Sector" } as const;

/** ⌘K: search startups, founders and sectors. WAI-ARIA combobox with a live result count. */
export function SearchCommand({ open, onClose }: { open: boolean; onClose: (navigated?: boolean) => void }) {
  const navigated = useRef(false);
  return (
    <Dialog open={open} onClose={() => { const nav = navigated.current; navigated.current = false; onClose(nav); }} label="Search" className="max-w-xl !mt-[12vh]">
      <SearchBody onDone={(nav) => { navigated.current = nav; }} />
    </Dialog>
  );
}

function SearchBody({ onDone }: { onDone: (navigated: boolean) => void }) {
  const router = useRouter();
  const listId = useId();
  const input = useRef<HTMLInputElement>(null);
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [active, setActive] = useState(0);
  const [state, setState] = useState<"idle" | "loading" | "done">("idle");

  useEffect(() => input.current?.focus(), []);

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) return;
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      setState("loading");
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(term)}`, { signal: ctrl.signal });
        const data = (await res.json()) as { hits: SearchHit[] };
        setHits(data.hits);
        setActive(0);
        setState("done");
      } catch {
        /* aborted or offline: leave the last results */
      }
    }, 180);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [q]);

  const ready = q.trim().length >= 2;
  const shownHits = ready ? hits : [];
  const status = ready ? state : "idle";

  const go = (h: SearchHit) => {
    onDone(true);
    router.push(`/opportunities/${h.id}`);
    document.querySelector<HTMLDialogElement>("dialog[open]")?.close();
  };

  return (
    <div>
      <div className="flex items-center gap-3 border-b border-line px-4">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="shrink-0 text-faint" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></svg>
        <input
          ref={input}
          data-search-input
          role="combobox"
          aria-expanded={shownHits.length > 0}
          aria-controls={shownHits.length > 0 ? listId : undefined}
          aria-activedescendant={shownHits[active] ? `${listId}-${active}` : undefined}
          aria-label="Search startups, founders or sectors"
          aria-autocomplete="list"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(a + 1, shownHits.length - 1)); }
            else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
            else if (e.key === "Enter" && shownHits[active]) { e.preventDefault(); go(shownHits[active]); }
          }}
          placeholder="Search startups, founders, sectors…"
          className="h-14 w-full bg-transparent text-base text-ink outline-none placeholder:text-faint"
        />
        <kbd className="hidden shrink-0 rounded border border-line px-1.5 py-0.5 text-xs text-faint sm:block">Esc</kbd>
      </div>

      {shownHits.length > 0 && (
        <ul id={listId} role="listbox" aria-label="Results" className="max-h-80 overflow-y-auto p-2">
          {shownHits.map((h, i) => (
            <li
              key={h.id}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === active}
              onClick={() => go(h)}
              onMouseMove={() => setActive(i)}
              className={`flex cursor-pointer items-baseline justify-between gap-3 rounded-lg px-3 py-2.5 ${i === active ? "bg-accent-soft" : ""}`}
            >
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium text-ink">{h.name}</span>
                <span className="block truncate text-xs text-muted">{h.detail}</span>
              </span>
              <span className="shrink-0 text-xs text-faint">{MATCH_LABEL[h.match]}</span>
            </li>
          ))}
        </ul>
      )}
      <p role="status" className="px-5 pb-4 text-sm text-faint">
        {status === "idle" && "Type at least two letters. Try a startup, founder or sector."}
        {status === "loading" && "Searching…"}
        {status === "done" && (shownHits.length ? `${shownHits.length} ${shownHits.length === 1 ? "result" : "results"}` : `Nothing found for “${q.trim()}”.`)}
      </p>
    </div>
  );
}
