"use client";

import { useState, useTransition } from "react";
import { FUNDING_STAGES, STAGE_LABELS } from "@/types/domain";
import type { ThesisInput } from "@/lib/thesis/schema";
import { saveThesis, type SaveResult } from "@/app/(app)/settings/actions";
import { ChoiceInput } from "./choice-input";
import {
  BUSINESS_MODEL_OPTIONS, CORE_SECTOR_OPTIONS, COUNTRY_OPTIONS, EXCLUDED_OPTIONS, MAX_AGE_HOUR_OPTIONS, MIN_SCORE_OPTIONS, RECENCY_HOUR_OPTIONS, SUBSECTOR_OPTIONS,
} from "@/lib/thesis/options";

const field = "mt-1.5 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-indigo-500";
const DETERMINISTIC: Record<string, string> = { stage_fit: "computed from stage points below", recency: "computed from recency bands below" };

export function ThesisForm({ initial, version }: { initial: ThesisInput; version: number }) {
  const [form, setForm] = useState<ThesisInput>(initial);
  const [result, setResult] = useState<SaveResult | null>(null);
  const [pending, start] = useTransition();
  const set = <K extends keyof ThesisInput>(k: K, v: ThesisInput[K]) => setForm((f) => ({ ...f, [k]: v }));
  const total = form.criteria.filter((c) => c.enabled).reduce((s, c) => s + (Number(c.weight) || 0), 0);

  const recencyWeight = form.criteria.find((c) => c.criterion_key === "recency")?.weight ?? 10;
  const stageWeight = form.criteria.find((c) => c.criterion_key === "stage_fit")?.weight ?? 30;

  const submit = () => start(async () => setResult(await saveThesis(form)));

  return (
    <div className="space-y-8">
      <section className="space-y-5 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-900">Eligibility (hard filters)</h2>
        <ChoiceInput label="Geography" hint="Startups must be headquartered in / primarily operate from one of these countries." options={COUNTRY_OPTIONS} value={form.allowed_countries} onChange={(v) => set("allowed_countries", v)} placeholder="Select countries…" />
        <div>
          <div className="text-sm font-medium text-slate-800">Funding stages</div>
          <div className="mt-2 flex flex-wrap gap-x-5 gap-y-2">
            {FUNDING_STAGES.filter((s) => s !== "unknown").map((s) => (
              <label key={s} className="flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={form.allowed_stages.includes(s)}
                  onChange={(e) => set("allowed_stages", e.target.checked ? [...form.allowed_stages, s] : form.allowed_stages.filter((x) => x !== s))}
                />
                {STAGE_LABELS[s]}
              </label>
            ))}
          </div>
        </div>
        <div className="grid gap-5 sm:grid-cols-2">
          <label className="text-sm font-medium text-slate-800">Maximum announcement age (hours)
            <select className={field} value={form.max_announcement_age_hours} onChange={(e) => set("max_announcement_age_hours", Number(e.target.value))}>
              {MAX_AGE_HOUR_OPTIONS.map((h) => <option key={h} value={h}>{h} hours</option>)}
            </select>
          </label>
          <label className="text-sm font-medium text-slate-800">Minimum fit score to qualify (0–100)
            <select className={field} value={form.minimum_fit_score} onChange={(e) => set("minimum_fit_score", Number(e.target.value))}>
              {MIN_SCORE_OPTIONS.map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </label>
        </div>
      </section>

      <section className="space-y-5 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-900">Thesis</h2>
        <ChoiceInput label="Core sectors" hint="Pick from the list, or add a custom sector." options={CORE_SECTOR_OPTIONS} allowCustom value={form.included_sectors} onChange={(v) => set("included_sectors", v)} />
        <ChoiceInput label="Preferred subsectors" hint="Pick from the list, or add a custom subsector." options={SUBSECTOR_OPTIONS} allowCustom value={form.preferred_subsectors} onChange={(v) => set("preferred_subsectors", v)} />
        <ChoiceInput label="Excluded areas" hint="Areas that should score down. Pick from the list, or add a custom one." options={EXCLUDED_OPTIONS} allowCustom value={form.excluded_sectors} onChange={(v) => set("excluded_sectors", v)} />
        <ChoiceInput label="Preferred business models" options={BUSINESS_MODEL_OPTIONS} value={form.preferred_business_models} onChange={(v) => set("preferred_business_models", v)} />
        <label className="block text-sm font-medium text-slate-800">Natural-language thesis
          <p className="text-xs font-normal text-slate-500">This text is given to Gemini verbatim when scoring. Put nuanced preferences here.</p>
          <textarea rows={9} className={field} value={form.natural_language_thesis} onChange={(e) => set("natural_language_thesis", e.target.value)} />
        </label>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-900">Scoring weights</h2>
          <span className={`rounded-full px-3 py-1 text-xs font-medium ${total === 100 ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"}`}>Total {total} / 100</span>
        </div>
        <div className="mt-4 space-y-4">
          {form.criteria.map((c, i) => (
            <div key={c.criterion_key} className="grid gap-3 sm:grid-cols-[auto_1fr_6rem]">
              <input type="checkbox" className="mt-3" checked={c.enabled} onChange={(e) => set("criteria", form.criteria.map((x, j) => (j === i ? { ...x, enabled: e.target.checked } : x)))} aria-label={`Enable ${c.display_name}`} />
              <div>
                <div className="text-sm font-medium text-slate-800">{c.display_name} {DETERMINISTIC[c.criterion_key] && <span className="text-xs font-normal text-slate-400">({DETERMINISTIC[c.criterion_key]})</span>}</div>
                <textarea rows={2} className={`${field} !mt-1 text-xs`} value={c.description} onChange={(e) => set("criteria", form.criteria.map((x, j) => (j === i ? { ...x, description: e.target.value } : x)))} />
              </div>
              <input type="number" min={0} max={100} className={`${field} !mt-0`} value={c.weight} onChange={(e) => set("criteria", form.criteria.map((x, j) => (j === i ? { ...x, weight: Number(e.target.value) } : x)))} aria-label={`${c.display_name} weight`} />
            </div>
          ))}
        </div>
      </section>

      <section className="grid gap-6 rounded-xl border border-slate-200 bg-white p-6 shadow-sm md:grid-cols-2">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">Recency bands</h2>
          <p className="text-xs text-slate-500">Points awarded by announcement age. Older than the last band scores 0 (and fails the hard filter).</p>
          {form.recency_bands.map((b, i) => (
            <div key={i} className="mt-2 flex items-center gap-2 text-sm text-slate-600">
              ≤ <select className={`${field} !mt-0 w-24`} value={b.max_hours} onChange={(e) => set("recency_bands", form.recency_bands.map((x, j) => (j === i ? { ...x, max_hours: Number(e.target.value) } : x)))}>
                {RECENCY_HOUR_OPTIONS.map((h) => <option key={h} value={h}>{h}</option>)}
              </select> hours →
              <select className={`${field} !mt-0 w-20`} value={b.points} onChange={(e) => set("recency_bands", form.recency_bands.map((x, j) => (j === i ? { ...x, points: Number(e.target.value) } : x)))}>
                {Array.from({ length: recencyWeight + 1 }, (_, n) => n).map((n) => <option key={n} value={n}>{n}</option>)}
              </select> pts
            </div>
          ))}
        </div>
        <div>
          <h2 className="text-sm font-semibold text-slate-900">Stage points</h2>
          <p className="text-xs text-slate-500">Points for the stage-fit criterion, per allowed stage.</p>
          {form.allowed_stages.map((s) => (
            <div key={s} className="mt-2 flex items-center gap-2 text-sm text-slate-600">
              <span className="w-28">{STAGE_LABELS[s]}</span>
              <select className={`${field} !mt-0 w-20`} value={form.stage_points[s] ?? 0} onChange={(e) => set("stage_points", { ...form.stage_points, [s]: Number(e.target.value) })}>
                {Array.from({ length: stageWeight + 1 }, (_, n) => n).map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            </div>
          ))}
        </div>
      </section>

      <div className="flex items-center gap-4">
        <button onClick={submit} disabled={pending || total !== 100} className="rounded-md bg-indigo-600 px-5 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50">
          {pending ? "Saving…" : `Save as version ${version + 1}`}
        </button>
        {total !== 100 && <span className="text-sm text-rose-600">Weights must total 100 before saving.</span>}
        {result?.ok && <span className="text-sm text-emerald-700">{result.message}</span>}
        {result && !result.ok && <ul className="text-sm text-rose-600">{result.errors.map((e, i) => <li key={i}>{e}</li>)}</ul>}
      </div>
    </div>
  );
}
