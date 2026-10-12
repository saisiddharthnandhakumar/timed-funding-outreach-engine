"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { CUSTOM_LABEL_PATTERN } from "@/lib/thesis/options";
import { CloseIcon } from "./icons";
import { cx } from "./ui";

/**
 * Multi-select. Values can only be added by picking from `options`; when `allowCustom` is set a validated
 * “add your own” entry is offered as well (same rules as the server-side schema).
 * Selected values are chips with their own remove buttons; “Add” opens a searchable checklist.
 */
export function ChoiceInput({
  label, hint, options, value, onChange, allowCustom = false, placeholder = "None selected",
}: {
  label: string;
  hint?: string;
  options: readonly string[];
  value: string[];
  onChange: (v: string[]) => void;
  allowCustom?: boolean;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [custom, setCustom] = useState("");
  const [customError, setCustomError] = useState<string | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const id = useId();

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => !root.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        root.current?.querySelector<HTMLButtonElement>("[data-add]")?.focus();
      }
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
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
      <p id={`${id}-l`} className="text-body font-medium text-ink">{label}</p>
      {hint && <p className="text-meta text-ink-3">{hint}</p>}
      <div role="group" aria-labelledby={`${id}-l`} className="mt-2 flex min-h-11 flex-wrap items-center gap-1.5 rounded-md border border-control bg-surface p-1.5">
        {value.length === 0 && <span className="px-2 text-meta text-ink-3">{placeholder}</span>}
        {value.map((v) => (
          <span key={v} className="inline-flex h-7 items-center gap-1 rounded-md bg-sunken pl-2.5 pr-1 text-meta text-ink">
            {v}
            {!options.includes(v) && <span className="rounded bg-line px-1 text-[10px] uppercase tracking-wide text-ink-2">custom</span>}
            <button type="button" onClick={() => toggle(v)} aria-label={`Remove ${v}`} className="grid size-5 place-items-center rounded text-ink-3 hover:bg-line hover:text-ink">
              <CloseIcon width={12} height={12} />
            </button>
          </span>
        ))}
        <button type="button" data-add onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-controls={`${id}-p`} className="h-7 rounded-md px-2.5 text-meta font-medium text-accent hover:bg-accent-soft">
          + Add
        </button>
      </div>

      {open && (
        <div id={`${id}-p`} className="absolute z-20 mt-1 w-full rounded-lg border border-line bg-surface shadow-pop">
          <input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search…" aria-label={`Search ${label}`} className="w-full rounded-t-lg border-b border-line bg-transparent px-3 py-2.5 text-body outline-none" />
          <ul className="max-h-60 overflow-auto py-1" aria-label={label}>
            {filtered.length === 0 && <li className="px-3 py-2 text-meta text-ink-3">No matches{allowCustom ? ". Add it as your own below." : "."}</li>}
            {filtered.map((o) => (
              <li key={o}>
                <label className="flex cursor-pointer items-center gap-2.5 px-3 py-1.5 text-body hover:bg-sunken">
                  <input type="checkbox" checked={has(o)} onChange={() => toggle(o)} className="size-4 accent-[var(--accent)]" />
                  {o}
                </label>
              </li>
            ))}
          </ul>
          {allowCustom && (
            <div className="border-t border-line p-2">
              <div className="flex gap-2">
                <input
                  value={custom}
                  onChange={(e) => { setCustom(e.target.value); setCustomError(null); }}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addCustom(); } }}
                  placeholder="Not listed? Add your own"
                  aria-label={`Add your own ${label.toLowerCase()}`}
                  aria-invalid={customError ? true : undefined}
                  className={cx("h-9 flex-1 rounded-md border bg-surface px-2.5 text-meta outline-none", customError ? "border-bad" : "border-line-strong")}
                />
                <button type="button" onClick={addCustom} className="h-9 rounded-md bg-accent px-3 text-meta font-medium text-accent-ink hover:bg-accent-hover">Add</button>
              </div>
              {customError && <p role="alert" className="mt-1 text-meta text-bad">{customError}</p>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
