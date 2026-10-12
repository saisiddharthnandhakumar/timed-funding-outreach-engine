"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { CUSTOM_LABEL_PATTERN } from "@/lib/thesis/options";
import { btn, field } from "./ui";

/**
 * Multi-select. Selected values are chips with their own remove buttons; "Add" opens a searchable list.
 * Values can only be added by picking from `options`; with `allowCustom`, a validated custom entry is offered too.
 */
export function ChoiceInput({
  label, hint, options, value, onChange, allowCustom = false, placeholder = "None selected", addLabel = "Add", autoFocusTrigger = false,
}: {
  label: string;
  hint?: string;
  options: readonly string[];
  value: string[];
  onChange: (v: string[]) => void;
  allowCustom?: boolean;
  placeholder?: string;
  addLabel?: string;
  autoFocusTrigger?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [custom, setCustom] = useState("");
  const [customError, setCustomError] = useState<string | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const id = useId();

  useEffect(() => {
    if (autoFocusTrigger) trigger.current?.focus();
  }, [autoFocusTrigger]);

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

  const filtered = useMemo(() => options.filter((o) => o.toLowerCase().includes(query.trim().toLowerCase())), [options, query]);
  const has = (v: string) => value.some((x) => x.toLowerCase() === v.toLowerCase());
  const toggle = (o: string) => onChange(has(o) ? value.filter((x) => x.toLowerCase() !== o.toLowerCase()) : [...value, o]);

  const addCustom = () => {
    const t = custom.trim().replace(/\s+/g, " ");
    if (!t) return;
    if (!CUSTOM_LABEL_PATTERN.test(t)) return setCustomError("Use 3–60 characters: letters, numbers and basic punctuation.");
    if (has(t)) return setCustomError("Already added.");
    onChange([...value, t]);
    setCustom("");
    setCustomError(null);
  };

  return (
    <div ref={root} className="relative">
      <div id={`${id}-label`} className="text-sm font-medium text-ink">{label}</div>
      {hint && <p className="text-sm text-faint">{hint}</p>}
      <div className="mt-2 flex flex-wrap items-center gap-2" role="group" aria-labelledby={`${id}-label`}>
        {value.length === 0 && <span className="text-sm text-faint">{placeholder}</span>}
        {value.map((v) => (
          <span key={v} className="inline-flex min-h-9 items-center gap-1 rounded-full bg-sunken pl-3 pr-1 text-sm text-ink">
            {v}
            {!options.includes(v) && <span className="text-xs text-faint">(custom)</span>}
            <button type="button" aria-label={`Remove ${v}`} onClick={() => { toggle(v); trigger.current?.focus(); }} className="flex h-7 w-7 items-center justify-center rounded-full text-muted hover:bg-line hover:text-ink">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
            </button>
          </span>
        ))}
        <button ref={trigger} type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-controls={`${id}-panel`} className="inline-flex min-h-9 items-center gap-1 rounded-full border border-dashed border-field px-3 text-sm font-medium text-muted hover:bg-sunken hover:text-ink">
          <span aria-hidden="true">+</span> {addLabel}
          <span className="sr-only"> to {label}</span>
        </button>
      </div>

      {open && (
        <div id={`${id}-panel`} className="absolute z-20 mt-2 w-full max-w-md rounded-xl border border-line bg-surface shadow-lg">
          <input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search…" aria-label={`Search ${label}`} className="w-full rounded-t-xl border-b border-line bg-transparent px-3 py-2.5 text-sm outline-none" />
          <ul className="max-h-60 overflow-auto py-1">
            {filtered.length === 0 && <li className="px-3 py-2 text-sm text-faint">No matches{allowCustom ? ". Add it as a custom entry below." : ""}</li>}
            {filtered.map((o) => (
              <li key={o}>
                <label className="flex min-h-10 cursor-pointer items-center gap-2.5 px-3 text-sm text-ink hover:bg-sunken">
                  <input type="checkbox" checked={has(o)} onChange={() => toggle(o)} className="h-4 w-4 accent-[var(--accent)]" />
                  {o}
                </label>
              </li>
            ))}
          </ul>
          {allowCustom && (
            <div className="border-t border-line p-2.5">
              <div className="flex gap-2">
                <input
                  value={custom}
                  aria-label={`Custom ${label}`}
                  onChange={(e) => { setCustom(e.target.value); setCustomError(null); }}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addCustom(); } }}
                  placeholder="Not listed? Add your own"
                  className={`${field} flex-1`}
                />
                <button type="button" onClick={addCustom} className={btn.secondary}>Add</button>
              </div>
              {customError && <p role="alert" className="mt-1.5 text-sm text-bad">{customError}</p>}
            </div>
          )}
          <div className="flex justify-end border-t border-line p-2"><button type="button" onClick={() => { setOpen(false); trigger.current?.focus(); }} className={btn.ghost}>Done</button></div>
        </div>
      )}
    </div>
  );
}
