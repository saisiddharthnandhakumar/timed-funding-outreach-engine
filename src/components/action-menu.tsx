"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";

/**
 * Overflow ("More") menu built as a disclosure, not role="menu": a button that reveals a short list of
 * ordinary links/buttons. Esc closes and returns focus, outside click closes. The panel stays mounted
 * (just hidden) so server-action forms inside it submit reliably.
 */
export function ActionMenu({ label = "More actions", children, align = "right", triggerId }: { label?: string; children: ReactNode; align?: "left" | "right"; triggerId?: string }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const panelId = useId();

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (root.current && !root.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        trigger.current?.focus();
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
    <div ref={root} className="relative z-10">
      <button
        ref={trigger}
        id={triggerId}
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={label}
        onClick={() => setOpen((o) => !o)}
        className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-transparent text-muted hover:bg-sunken hover:text-ink"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="5" cy="12" r="1.6" /><circle cx="12" cy="12" r="1.6" /><circle cx="19" cy="12" r="1.6" /></svg>
      </button>
      <div
        id={panelId}
        hidden={!open}
        onClick={(e) => {
          if ((e.target as HTMLElement).closest("a,button")) setTimeout(() => setOpen(false), 0);
        }}
        className={`absolute top-full z-20 mt-1 w-60 overflow-hidden rounded-xl border border-line bg-surface p-1 shadow-lg ${align === "right" ? "right-0" : "left-0"} [&_a]:flex [&_a]:min-h-10 [&_a]:items-center [&_a]:rounded-lg [&_a]:px-3 [&_a]:text-sm [&_a]:text-ink hover:[&_a]:bg-sunken [&_button]:flex [&_button]:min-h-10 [&_button]:w-full [&_button]:items-center [&_button]:rounded-lg [&_button]:px-3 [&_button]:text-left [&_button]:text-sm hover:[&_button]:bg-sunken`}
      >
        {children}
      </div>
    </div>
  );
}
