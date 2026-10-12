"use client";

import { useRef, useState, useTransition } from "react";
import { STAGE_LABELS } from "@/types/domain";
import type { ThesisInput } from "@/lib/thesis/schema";
import { saveThesis, type SaveResult } from "@/app/(app)/settings/actions";
import { ChoiceInput } from "./choice-input";
import { CollapsedChoice } from "./collapsed-choice";
import { DisclosureSection } from "./disclosure-section";
import { StageControl } from "./stage-control";
import { btn, field } from "./ui";
import {
  BUSINESS_MODEL_OPTIONS, CORE_SECTOR_OPTIONS, COUNTRY_OPTIONS, EXCLUDED_OPTIONS, MAX_AGE_HOUR_OPTIONS, MIN_SCORE_OPTIONS, RECENCY_HOUR_OPTIONS, SUBSECTOR_OPTIONS,
} from "@/lib/thesis/options";

const DETERMINISTIC: Record<string, string> = { stage_fit: "computed from the stage points below", recency: "computed from the recency bands below" };
const ageLabel = (h: number) => (h >= 48 && h % 24 === 0 ? `${h} hours (${h / 24} days)` : h === 24 ? "24 hours (1 day)" : `${h} hours`);

export function ThesisForm({ initial, version }: { initial: ThesisInput; version: number }) {
  const [form, setForm] = useState<ThesisInput>(initial);
  const [baseline, setBaseline] = useState<ThesisInput>(initial);
  const [result, setResult] = useState<SaveResult | null>(null);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [pending, start] = useTransition();
  const advanced = useRef<HTMLDivElement>(null);
  const set = <K extends keyof ThesisInput>(k: K, v: ThesisInput[K]) => {
    setResult(null);
    setForm((f) => ({ ...f, [k]: v }));
  };
  const total = form.criteria.filter((c) => c.enabled).reduce((s, c) => s + (Number(c.weight) || 0), 0);
  const weightsOk = total === 100;
  const dirty = JSON.stringify(form) !== JSON.stringify(baseline);

  const recencyWeight = form.criteria.find((c) => c.criterion_key === "recency")?.weight ?? 10;
  const stageWeight = form.criteria.find((c) => c.criterion_key === "stage_fit")?.weight ?? 30;

  const submit = () =>
    start(async () => {
      const r = await saveThesis(form);
      setResult(r);
      if (r.ok) setBaseline(form);
    });
  const revealWeights = () => {
    setAdvancedOpen(true);
    setTimeout(() => {
      advanced.current?.scrollIntoView({ block: "center" });
      advanced.current?.querySelector<HTMLInputElement>('input[type="number"]')?.focus();
    }, 50);
  };

  return (
    <div className="space-y-10">
      <label className="block">
        <span className="text-sm font-medium text-ink">Investment thesis</span>
        <span className="block text-sm text-faint">In your own words. This guides how every startup is scored, so put nuanced preferences here.</span>
        <textarea rows={8} className={`${field} mt-2 leading-relaxed`} value={form.natural_language_thesis} onChange={(e) => set("natural_language_thesis", e.target.value)} />
      </label>

      <ChoiceInput label="Target geography" hint="Startups must be headquartered in, or primarily operate from, one of these countries." options={COUNTRY_OPTIONS} value={form.allowed_countries} onChange={(v) => set("allowed_countries", v)} placeholder="No country selected" addLabel="Add country" />

      <StageControl value={form.allowed_stages} onChange={(v) => set("allowed_stages", v as ThesisInput["allowed_stages"])} />

      <ChoiceInput label="Focus sectors" hint="Pick from the list, or add your own." options={CORE_SECTOR_OPTIONS} allowCustom value={form.included_sectors} onChange={(v) => set("included_sectors", v)} addLabel="Add sector" />

      <CollapsedChoice label="Preferred subsectors" hint="Pick from the list, or add your own." options={SUBSECTOR_OPTIONS} allowCustom value={form.preferred_subsectors} onChange={(v) => set("preferred_subsectors", v)} addLabel="Add subsector" />

      <div className="grid gap-6 sm:grid-cols-2">
        <label className="block text-sm font-medium text-ink">Minimum fit score
          <span className="block text-sm font-normal text-faint">Startups scoring below this aren’t shown to you.</span>
          <select className={`${field} mt-2`} value={form.minimum_fit_score} onChange={(e) => set("minimum_fit_score", Number(e.target.value))}>
            {MIN_SCORE_OPTIONS.map((n) => <option key={n} value={n}>{n} out of 100</option>)}
          </select>
        </label>
        <label className="block text-sm font-medium text-ink">Maximum announcement age
          <span className="block text-sm font-normal text-faint">Older funding news is ignored.</span>
          <select className={`${field} mt-2`} value={form.max_announcement_age_hours} onChange={(e) => set("max_announcement_age_hours", Number(e.target.value))}>
            {MAX_AGE_HOUR_OPTIONS.map((h) => <option key={h} value={h}>{ageLabel(h)}</option>)}
          </select>
        </label>
      </div>

      <div>
        <DisclosureSection title="More preferences" hint="Excluded areas, business models">
          <div className="space-y-6">
            <ChoiceInput label="Excluded areas" hint="Areas that should score down. Pick from the list, or add your own." options={EXCLUDED_OPTIONS} allowCustom value={form.excluded_sectors} onChange={(v) => set("excluded_sectors", v)} addLabel="Add area" />
            <ChoiceInput label="Preferred business models" options={BUSINESS_MODEL_OPTIONS} value={form.preferred_business_models} onChange={(v) => set("preferred_business_models", v)} addLabel="Add model" />
          </div>
        </DisclosureSection>

        <div ref={advanced}>
          <DisclosureSection title="Advanced scoring" hint="Criterion weights, stage points, recency bands" open={advancedOpen} onOpenChange={setAdvancedOpen} id="advanced-scoring">
            <div className="space-y-10">
              <div>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-sm font-semibold text-ink">Criterion weights</h3>
                  <span className={`num text-sm font-medium ${weightsOk ? "text-ok" : "text-bad"}`}>{weightsOk ? "✓ " : "! "}Total {total} / 100{weightsOk ? "" : " (must be 100)"}</span>
                </div>
                <div className="mt-4 space-y-5">
                  {form.criteria.map((c, i) => (
                    <div key={c.criterion_key} className="grid gap-3 sm:grid-cols-[auto_1fr_6rem]">
                      <input type="checkbox" className="mt-3 h-4 w-4 accent-[var(--accent)]" checked={c.enabled} onChange={(e) => set("criteria", form.criteria.map((x, j) => (j === i ? { ...x, enabled: e.target.checked } : x)))} aria-label={`Include ${c.display_name} in scoring`} />
                      <div>
                        <div className="text-sm font-medium text-ink">{c.display_name} {DETERMINISTIC[c.criterion_key] && <span className="text-xs font-normal text-faint">({DETERMINISTIC[c.criterion_key]})</span>}</div>
                        <textarea rows={2} className={`${field} mt-1 text-xs`} value={c.description} aria-label={`${c.display_name} description`} onChange={(e) => set("criteria", form.criteria.map((x, j) => (j === i ? { ...x, description: e.target.value } : x)))} />
                      </div>
                      <input type="number" min={0} max={100} className={`${field} mt-0`} value={c.weight} onChange={(e) => set("criteria", form.criteria.map((x, j) => (j === i ? { ...x, weight: Number(e.target.value) } : x)))} aria-label={`${c.display_name} weight`} />
                    </div>
                  ))}
                </div>
              </div>

              <div className="grid gap-8 md:grid-cols-2">
                <div>
                  <h3 className="text-sm font-semibold text-ink">Recency bands</h3>
                  <p className="text-sm text-faint">Points by announcement age. Older than the last band scores 0.</p>
                  {form.recency_bands.map((b, i) => (
                    <div key={i} className="mt-2 flex flex-wrap items-center gap-2 text-sm text-muted">
                      within
                      <select aria-label={`Band ${i + 1} hours`} className={`${field} w-24`} value={b.max_hours} onChange={(e) => set("recency_bands", form.recency_bands.map((x, j) => (j === i ? { ...x, max_hours: Number(e.target.value) } : x)))}>
                        {RECENCY_HOUR_OPTIONS.map((h) => <option key={h} value={h}>{h}</option>)}
                      </select>
                      hours →
                      <select aria-label={`Band ${i + 1} points`} className={`${field} w-20`} value={b.points} onChange={(e) => set("recency_bands", form.recency_bands.map((x, j) => (j === i ? { ...x, points: Number(e.target.value) } : x)))}>
                        {Array.from({ length: recencyWeight + 1 }, (_, n) => n).map((n) => <option key={n} value={n}>{n}</option>)}
                      </select>
                      pts
                    </div>
                  ))}
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-ink">Stage points</h3>
                  <p className="text-sm text-faint">Points for the stage-fit criterion, per allowed stage.</p>
                  {form.allowed_stages.map((s) => (
                    <div key={s} className="mt-2 flex items-center gap-2 text-sm text-muted">
                      <span className="w-28">{STAGE_LABELS[s]}</span>
                      <select aria-label={`${STAGE_LABELS[s]} points`} className={`${field} w-20`} value={form.stage_points[s] ?? 0} onChange={(e) => set("stage_points", { ...form.stage_points, [s]: Number(e.target.value) })}>
                        {Array.from({ length: stageWeight + 1 }, (_, n) => n).map((n) => <option key={n} value={n}>{n}</option>)}
                      </select>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </DisclosureSection>
        </div>
        <div className="border-t border-line" />
      </div>

      <div className="sticky bottom-20 z-10 -mx-4 border-t border-line bg-canvas/95 px-4 py-4 backdrop-blur sm:-mx-8 sm:px-8 lg:bottom-0 lg:-mx-12 lg:px-12">
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
          <button type="button" onClick={submit} disabled={pending || !weightsOk || !dirty} className={btn.primary}>{pending ? "Saving…" : "Save changes"}</button>
          <p className="text-sm text-muted">Saves as version {version + 1}. Applies to new scans; existing scores aren’t changed.</p>
        </div>
        <div role="status" className="mt-2 text-sm">
          {!weightsOk && <span className="text-bad">Scoring weights total {total}, not 100. <button type="button" onClick={revealWeights} className="font-medium underline">Review weights</button></span>}
          {result?.ok && <span className="text-ok">✓ {result.message}</span>}
          {result && !result.ok && <ul className="text-bad">{result.errors.map((e, i) => <li key={i}>{e}</li>)}</ul>}
        </div>
      </div>
    </div>
  );
}
