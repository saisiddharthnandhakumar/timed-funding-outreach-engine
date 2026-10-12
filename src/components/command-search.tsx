"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useMemo, useRef, useState, useSyncExternalStore } from "react";
import type { SearchResult } from "@/app/api/search/route";
import { useModal } from "./dialog";
import { ArrowRight, SearchIcon } from "./icons";
import { NAV_ITEMS } from "./nav";
import { Kbd, cx } from "./ui";

interface Item {
  key: string;
  group: "Startups" | "Founders" | "Go to";
  title: string;
  subtitle?: string;
  href: string;
  qualified?: boolean;
}

const PAGES: Item[] = [
  ...NAV_ITEMS.map((n) => ({ key: `p-${n.href}`, group: "Go to" as const, title: n.label, href: n.href })),
  { key: "p-thesis", group: "Go to", title: "Investment thesis", subtitle: "Settings", href: "/settings" },
  { key: "p-discovery", group: "Go to", title: "Sources", subtitle: "Settings · Discovery", href: "/settings/discovery" },
  { key: "p-system", group: "Go to", title: "System health", subtitle: "Settings · System", href: "/settings/system" },
];

/**
 * ⌘K / Ctrl-K search across company names, sectors and founders, plus quick navigation.
 * Native <dialog> (focus trap, Esc) + combobox/listbox semantics for screen readers.
 */
export function CommandSearch() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  // `term` is the query the latest results belong to; “loading” is simply “results not yet for this query”.
  const [remote, setRemote] = useState<{ term: string; items: Item[] }>({ term: "", items: [] });
  const [active, setActive] = useState(0);
  const mac = useSyncExternalStore(() => () => {}, () => /Mac|iPhone|iPad/.test(navigator.platform), () => true);
  const listId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const close = () => {
    setOpen(false);
    setQ("");
    setActive(0);
  };
  const modal = useModal(open, close);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        if (open) close();
        else setOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const term = q.trim();
  useEffect(() => {
    if (!open || term.length < 2) return;
    const ctl = new AbortController();
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(term)}`, { signal: ctl.signal });
        const json = (await res.json()) as { results: SearchResult[] };
        setRemote({ term, items: json.results.map((r) => ({ key: `${r.kind}-${r.id}`, group: r.kind === "startup" ? "Startups" : "Founders", title: r.title, subtitle: r.subtitle, href: r.href, qualified: r.qualified })) });
        setActive(0);
      } catch {
        if (!ctl.signal.aborted) setRemote({ term, items: [] });
      }
    }, 150);
    return () => {
      clearTimeout(t);
      ctl.abort();
    };
  }, [term, open]);

  const loading = open && term.length >= 2 && remote.term !== term;
  const items = useMemo(() => {
    const needle = term.toLowerCase();
    const pages = needle ? PAGES.filter((p) => p.title.toLowerCase().includes(needle) || p.subtitle?.toLowerCase().includes(needle)) : PAGES;
    return [...(term.length >= 2 ? remote.items : []), ...pages];
  }, [term, remote]);

  const go = (item: Item | undefined) => {
    if (!item) return;
    close();
    router.push(item.href);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, items.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      go(items[active]);
    }
  };

  useEffect(() => {
    document.getElementById(`${listId}-${active}`)?.scrollIntoView({ block: "nearest" });
  }, [active, listId]);
  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  let lastGroup = "";
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Search startups, founders and sectors"
        aria-keyshortcuts="Meta+K Control+K"
        className="inline-flex h-9 items-center gap-2 rounded-md border border-control bg-surface px-2.5 text-meta text-ink-3 hover:bg-sunken sm:w-64"
      >
        <SearchIcon />
        <span className="hidden flex-1 text-left sm:inline">Search</span>
        <span className="hidden sm:inline"><Kbd>{mac ? "⌘K" : "Ctrl K"}</Kbd></span>
      </button>

      <dialog {...modal} aria-label="Search" className="dlg-modal mx-auto mt-[12vh] w-[min(40rem,calc(100vw-2rem))] overflow-hidden rounded-lg shadow-pop">
        <div className="flex items-center gap-3 border-b border-line px-4">
          <SearchIcon className="shrink-0 text-ink-3" />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setActive(0);
            }}
            onKeyDown={onKeyDown}
            role="combobox"
            aria-expanded="true"
            aria-controls={listId}
            aria-activedescendant={items[active] ? `${listId}-${active}` : undefined}
            aria-autocomplete="list"
            placeholder="Search startups, founders, sectors…"
            className="h-14 flex-1 bg-transparent text-body outline-none placeholder:text-ink-3"
            autoComplete="off"
            spellCheck={false}
          />
          <Kbd>Esc</Kbd>
        </div>
        <ul id={listId} role="listbox" aria-label="Results" className="max-h-[min(24rem,60vh)] overflow-y-auto p-2">
          {items.length === 0 && !loading && <li className="px-3 py-8 text-center text-body text-ink-2">No matches for “{q.trim()}”.</li>}
          {items.map((item, i) => {
            const header = item.group !== lastGroup ? item.group : null;
            lastGroup = item.group;
            return (
              <li key={item.key} role="presentation">
                {header && <div className="px-3 pb-1 pt-3 text-label text-ink-3">{header}</div>}
                <div
                  id={`${listId}-${i}`}
                  role="option"
                  aria-selected={i === active}
                  onMouseMove={() => setActive(i)}
                  onClick={() => go(item)}
                  className={cx("flex cursor-pointer items-center gap-3 rounded-md px-3 py-2", i === active ? "bg-accent-soft" : "")}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-body text-ink">{item.title}</span>
                    {item.subtitle && <span className="block truncate text-meta text-ink-3">{item.subtitle}</span>}
                  </span>
                  {item.group !== "Go to" && (item.qualified ? <span className="text-meta text-ink-2">Opportunity</span> : <span className="text-meta text-ink-3">Discovery</span>)}
                  {i === active && <ArrowRight className="shrink-0 text-accent" />}
                </div>
              </li>
            );
          })}
          {loading && <li role="presentation" className="px-3 py-2 text-meta text-ink-3">Searching…</li>}
        </ul>
      </dialog>
    </>
  );
}
