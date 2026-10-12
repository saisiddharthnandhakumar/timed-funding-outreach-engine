"use client";

import Form from "next/form";
import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { AGE_LABEL, AGE_OPTIONS, SCORE_OPTIONS, SIZE_BUCKETS, SIZE_LABEL, type OpportunityFilters } from "@/lib/opportunity/filters";
import { stageLabel } from "@/lib/format";
import { btn, field } from "../ui";

interface Options {
  stages: string[];
  sectors: string[];
  locations: string[];
  sources: string[];
}

function Select({ name, label, value, children }: { name: string; label: string; value: string | number | undefined; children: React.ReactNode }) {
  return (
    <label className="block text-sm font-medium text-ink">
      {label}
      <select name={name} defaultValue={value ?? ""} className={`${field} mt-1`}>
        <option value="">Any</option>
        {children}
      </select>
    </label>
  );
}

/**
 * Advanced filters behind one button. A disclosure (not a menu) holding a GET form: state lives in the URL,
 * so views are shareable and the back button works. Shows how many filters are on.
 */
export function FilterPopover({ options, current, count, clearHref }: { options: Options; current: OpportunityFilters; count: number; clearHref: string }) {
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
    <div ref={root} className="relative">
      <button ref={trigger} type="button" aria-expanded={open} aria-controls={panelId} onClick={() => setOpen((o) => !o)} className={btn.secondary}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M4 6h16M7 12h10M10 18h4" /></svg>
        Filters
        {count > 0 && <span className="num rounded-full bg-accent px-1.5 text-xs font-semibold leading-5 text-on-accent">{count}<span className="sr-only"> active</span></span>}
      </button>

      <div id={panelId} hidden={!open} className="absolute right-0 top-full z-20 mt-2 w-[min(22rem,calc(100vw-2rem))] rounded-xl border border-line bg-surface p-4 shadow-lg">
        <Form key={JSON.stringify(current)} action="/opportunities" onSubmit={() => setOpen(false)} className="space-y-3">
          <input type="hidden" name="f" value={current.status} />
          <div className="grid grid-cols-2 gap-3">
            <Select name="stage" label="Stage" value={current.stage}>{options.stages.map((s) => <option key={s} value={s}>{stageLabel(s)}</option>)}</Select>
            <Select name="min" label="Fit score" value={current.minScore}>{SCORE_OPTIONS.map((n) => <option key={n} value={n}>{n}+</option>)}</Select>
          </div>
          <Select name="sector" label="Sector" value={current.sector}>{options.sectors.map((s) => <option key={s}>{s}</option>)}</Select>
          <Select name="loc" label="Location" value={current.location}>{options.locations.map((s) => <option key={s}>{s}</option>)}</Select>
          <div className="grid grid-cols-2 gap-3">
            <Select name="size" label="Funding size" value={current.size}>{SIZE_BUCKETS.map((b) => <option key={b} value={b}>{SIZE_LABEL[b]}</option>)}</Select>
            <Select name="age" label="Announced" value={current.maxAgeHours}>{AGE_OPTIONS.map((h) => <option key={h} value={h}>{AGE_LABEL[h]}</option>)}</Select>
          </div>
          <Select name="src" label="Reported by" value={current.source}>{options.sources.map((s) => <option key={s}>{s}</option>)}</Select>
          <div className="flex items-center justify-between pt-1">
            <Link href={clearHref} onClick={() => setOpen(false)} className="text-sm font-medium text-muted hover:text-ink hover:underline">Clear filters</Link>
            <button type="submit" className={btn.primary}>Apply filters</button>
          </div>
        </Form>
      </div>
    </div>
  );
}
