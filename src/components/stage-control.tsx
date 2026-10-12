"use client";

import { useEffect, useId, useRef, useState } from "react";
import { FUNDING_STAGES, STAGE_LABELS, type FundingStage } from "@/types/domain";

const ORDER = FUNDING_STAGES.filter((s) => s !== "unknown");

/** Selected stages as chips; everything else is one "+ Add stage" away. */
export function StageControl({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const id = useId();
  const selected = ORDER.filter((s) => value.includes(s));
  const remaining = ORDER.filter((s) => !value.includes(s));

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (root.current && !root.current.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        trigger.current?.focus();
      }
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);

  return (
    <div ref={root} className="relative">
      <div id={`${id}-label`} className="text-sm font-medium text-ink">Funding stages</div>
      <p className="text-sm text-faint">Only startups raising at these stages qualify.</p>
      <div className="mt-2 flex flex-wrap items-center gap-2" role="group" aria-labelledby={`${id}-label`}>
        {selected.map((s) => (
          <span key={s} className="inline-flex min-h-9 items-center gap-1 rounded-full bg-sunken pl-3 pr-1 text-sm text-ink">
            {STAGE_LABELS[s as FundingStage]}
            <button
              type="button"
              aria-label={`Remove ${STAGE_LABELS[s as FundingStage]}`}
              disabled={selected.length === 1}
              title={selected.length === 1 ? "At least one stage is required" : undefined}
              onClick={() => { onChange(value.filter((x) => x !== s)); trigger.current?.focus(); }}
              className="flex h-7 w-7 items-center justify-center rounded-full text-muted hover:bg-line hover:text-ink disabled:opacity-40"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
            </button>
          </span>
        ))}
        {remaining.length > 0 && (
          <button ref={trigger} type="button" aria-expanded={open} aria-controls={`${id}-panel`} onClick={() => setOpen((o) => !o)} className="inline-flex min-h-9 items-center gap-1 rounded-full border border-dashed border-field px-3 text-sm font-medium text-muted hover:bg-sunken hover:text-ink">
            <span aria-hidden="true">+</span> Add stage
          </button>
        )}
      </div>
      {selected.length === 1 && <p className="mt-2 text-sm text-faint">At least one stage is required.</p>}
      {open && (
        <ul id={`${id}-panel`} className="absolute z-20 mt-2 w-56 rounded-xl border border-line bg-surface p-1 shadow-lg">
          {remaining.map((s) => (
            <li key={s}>
              <button
                type="button"
                onClick={() => {
                  onChange([...value, s]);
                  setOpen(false);
                  trigger.current?.focus();
                }}
                className="flex min-h-10 w-full items-center rounded-lg px-3 text-left text-sm text-ink hover:bg-sunken"
              >
                {STAGE_LABELS[s as FundingStage]}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
