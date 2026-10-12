"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { CUSTOM_LABEL_PATTERN } from "@/lib/thesis/options";

/**
 * Multi-select dropdown. Values can only be added by picking from `options`;
 * when `allowCustom` is set, a validated "Add custom" entry is offered as well.
 */
export function ChoiceInput({
  label, hint, options, value, onChange, allowCustom = false, placeholder = "Select…",
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

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (root.current && !root.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

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
      <label className="text-sm font-medium text-slate-800">{label}</label>
      {hint && <p className="text-xs text-slate-500">{hint}</p>}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="mt-1.5 flex min-h-[2.5rem] w-full flex-wrap items-center gap-1.5 rounded-md border border-slate-300 bg-white px-2 py-1.5 text-left text-sm"
      >
        {value.length === 0 && <span className="px-1 text-slate-400">{placeholder}</span>}
        {value.map((v) => (
          <span key={v} className="inline-flex items-center gap-1 rounded-full bg-indigo-50 px-2.5 py-0.5 text-xs text-indigo-700">
            {v}
            {!options.includes(v) && <span className="rounded bg-slate-100 px-1 text-[10px] uppercase text-slate-600">custom</span>}
            <span
              role="button"
              aria-label={`Remove ${v}`}
              onClick={(e) => {
                e.stopPropagation();
                toggle(v);
              }}
              className="cursor-pointer text-slate-400 hover:text-slate-700"
            >
              ×
            </span>
          </span>
        ))}
        <span className="ml-auto pr-1 text-slate-400">▾</span>
      </button>

      {open && (
        <div className="absolute z-20 mt-1 w-full rounded-md border border-slate-200 bg-white shadow-lg">
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search…"
            className="w-full border-b border-slate-100 px-3 py-2 text-sm outline-none"
          />
          <ul className="max-h-60 overflow-auto py-1" role="listbox" aria-multiselectable>
            {filtered.length === 0 && <li className="px-3 py-2 text-sm text-slate-400">No matches{allowCustom ? " — add it as custom below" : ""}</li>}
            {filtered.map((o) => (
              <li key={o}>
                <label className="flex cursor-pointer items-center gap-2 px-3 py-1.5 text-sm hover:bg-slate-50">
                  <input type="checkbox" checked={has(o)} onChange={() => toggle(o)} />
                  {o}
                </label>
              </li>
            ))}
          </ul>
          {allowCustom && (
            <div className="border-t border-slate-100 p-2">
              <div className="flex gap-2">
                <input
                  value={custom}
                  onChange={(e) => {
                    setCustom(e.target.value);
                    setCustomError(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addCustom();
                    }
                  }}
                  placeholder="Not listed? Add a custom one"
                  className="flex-1 rounded-md border border-slate-300 px-2 py-1.5 text-sm outline-none focus:border-indigo-500"
                />
                <button type="button" onClick={addCustom} className="rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-700">
                  Add
                </button>
              </div>
              {customError && <p className="mt-1 text-xs text-rose-600">{customError}</p>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
