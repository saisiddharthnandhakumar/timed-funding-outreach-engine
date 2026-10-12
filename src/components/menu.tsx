"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { MoreIcon } from "./icons";
import { cx } from "./ui";

export interface MenuItem {
  label: string;
  onSelect: () => void;
  danger?: boolean;
  hidden?: boolean;
}

/** Overflow menu: button + menu with arrow-key navigation, Escape, outside click and focus return. */
export function Menu({ items, label = "More actions", trigger }: { items: MenuItem[]; label?: string; trigger?: ReactNode }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const id = useId();
  const visible = items.filter((i) => !i.hidden);

  useEffect(() => {
    if (!open) return;
    root.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
    const onDown = (e: MouseEvent) => !root.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const close = (refocus = true) => {
    setOpen(false);
    if (refocus) root.current?.querySelector<HTMLButtonElement>("[data-trigger]")?.focus();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    const els = [...(root.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])];
    const at = els.indexOf(document.activeElement as HTMLElement);
    if (e.key === "Escape") { e.preventDefault(); close(); }
    else if (e.key === "ArrowDown") { e.preventDefault(); els[(at + 1) % els.length]?.focus(); }
    else if (e.key === "ArrowUp") { e.preventDefault(); els[(at - 1 + els.length) % els.length]?.focus(); }
    else if (e.key === "Home") { e.preventDefault(); els[0]?.focus(); }
    else if (e.key === "End") { e.preventDefault(); els[els.length - 1]?.focus(); }
    else if (e.key === "Tab") setOpen(false);
  };

  if (visible.length === 0) return null;
  return (
    <div ref={root} className="relative" onKeyDown={open ? onKeyDown : undefined}>
      <button type="button" data-trigger aria-haspopup="menu" aria-expanded={open} aria-controls={id} aria-label={label} onClick={() => setOpen((o) => !o)} className="grid size-9 place-items-center rounded-md border border-control bg-surface text-ink-2 hover:bg-sunken">
        {trigger ?? <MoreIcon />}
      </button>
      {open && (
        <div id={id} role="menu" aria-label={label} className="absolute right-0 z-30 mt-2 min-w-56 rounded-lg border border-line bg-surface p-1 shadow-pop">
          {visible.map((item) => (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              tabIndex={-1}
              onClick={() => { close(false); item.onSelect(); }}
              className={cx("flex w-full items-center rounded-md px-3 py-2 text-left text-meta hover:bg-sunken focus:bg-sunken focus:outline-none", item.danger ? "text-bad" : "text-ink")}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
