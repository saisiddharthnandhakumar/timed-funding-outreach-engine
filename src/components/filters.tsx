"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { ChevronDown } from "./icons";
import { buttonClass, cx } from "./ui";

/**
 * “Filters” popover. Its fields are ordinary form controls (rendered by the server page) inside the page’s
 * GET <form>, so filtering works through the URL and is shareable. The panel is hidden, not unmounted,
 * so applied filters keep being submitted when the search box is used.
 */
export function FilterPopover({ count, children }: { count: number; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const id = useId();

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => !root.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        root.current?.querySelector<HTMLButtonElement>("[data-trigger]")?.focus();
      }
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={root} className="relative">
      <button type="button" data-trigger onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-controls={id} className={buttonClass("secondary")}>
        Filters
        {count > 0 && <span className="rounded-full bg-accent px-1.5 text-label font-semibold tabular-nums text-accent-ink">{count}</span>}
        <ChevronDown className={cx("transition-transform duration-200", open && "rotate-180")} />
      </button>
      <div id={id} hidden={!open} role="group" aria-label="Filters" className="absolute right-0 z-30 mt-2 w-[min(22rem,calc(100vw-2rem))] rounded-lg border border-line bg-surface p-4 shadow-pop">
        {children}
      </div>
    </div>
  );
}

const field = "mt-1 h-9 w-full rounded-md border border-control bg-surface px-2.5 text-meta text-ink";
export function FilterSelect({ name, label, value, options, anyLabel = "Any" }: { name: string; label: string; value?: string; options: { value: string; label: string }[]; anyLabel?: string }) {
  return (
    <label className="block text-label text-ink-2">
      {label}
      <select name={name} defaultValue={value ?? ""} className={field}>
        <option value="">{anyLabel}</option>
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </label>
  );
}
