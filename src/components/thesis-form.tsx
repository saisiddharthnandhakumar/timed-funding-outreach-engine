"use client";

import { useState, useTransition, type ReactNode } from "react";
import { FUNDING_STAGES, STAGE_LABELS } from "@/types/domain";
import type { ThesisInput } from "@/lib/thesis/schema";
import { saveThesis, type SaveResult } from "@/app/(app)/settings/actions";
import { ChoiceInput } from "./choice-input";
import { DisclosureSection, buttonClass, cx } from "./ui";
import {
  BUSINESS_MODEL_OPTIONS, CORE_SECTOR_OPTIONS, COUNTRY_OPTIONS, EXCLUDED_OPTIONS, MAX_AGE_HOUR_OPTIONS, MIN_SCORE_OPTIONS, RECENCY_HOUR_OPTIONS, SUBSECTOR_OPTIONS,
} from "@/lib/thesis/options";

const field = "mt-1.5 w-full rounded-md border border-control bg-surface px-3 text-body text-ink";
const DETERMINISTIC: Record<string, string> = { stage_fit: "calculated from the stage points below", recency: "calculated from the recency bands below" };
const hours = (h: number) => (h < 48 ? `${h} hours` : `${h / 24} days`);

function Group({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <section className="py-8">
      <h2 className="text-heading text-ink">{title}</h2>
      {description && <p className="mt-1 max-w-2xl text-body text-ink-2">{description}</p>}
      <div className="mt-5 space-y-6">{children}</div>
    </section>
  );
}

/**
 * The thesis editor. Leads with the natural-language thesis, then structured preferences. Saving creates a new
 * immutable version through the same validated server action as before; scoring weights live under “Advanced scoring”.
 */
export function ThesisForm({ initial, version }: { initial: ThesisInput; version: number }) {
  const [form, setForm] = useState<ThesisInput>(initial);
  // After a save the server sends the new version as `initial`: adopt it, but keep the “Saved” message.
  const [baseVersion, setBaseVersion] = useState(version);
  if (baseVersion !== version) {
    setBaseVersion(version);
    setForm(initial);
  }
  const [result, setResult] = useState<SaveResult | null>(null);
  const [pending, start] = useTransition();
  const set = <K extends keyof ThesisInput>(k: K, v: ThesisInput[K]) => {
    setResult(null);
    setForm((f) => ({ ...f, [k]: v }));
  };
  const dirty = JSON.stringify(form) !== JSON.stringify(initial);
  const total = form.criteria.filter((c) => c.enabled).reduce((s, c) => s + (Number(c.weight) || 0), 0);
  const recencyWeight = form.criteria.find((c) => c.criterion_key === "recency")?.weight ?? 10;
  const stageWeight = form.criteria.find((c) => c.criterion_key === "stage_fit")?.weight ?? 30;
  const setCriterion = (i: number, patch: Partial<ThesisInput["criteria"][number]>) => set("criteria", form.criteria.map((x, j) => (j === i ? { ...x, ...patch } : x)));

  const submit = () => start(async () => setResult(await saveThesis(form)));
  const discard = () => {
    setForm(initial);
    setResult(null);
  };

  return (
    <div className="divide-y divide-line">
      <Group title="Investment thesis" description="Describe what you back, in your own words. This text is given to the AI when it judges each startup, so put nuance here.">
        <label className="block">
          <span className="sr-only">Investment thesis</span>
          <textarea rows={8} value={form.natural_language_thesis} onChange={(e) => set("natural_language_thesis", e.target.value)} className={cx(field, "!mt-0 py-3 leading-7")} />
        </label>
        <DisclosureSection title="Name and notes" quiet className="-mt-2 border-t-0">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-label text-ink-2">Name<input value={form.name} onChange={(e) => set("name", e.target.value)} className={cx(field, "h-10")} /></label>
            <label className="block text-label text-ink-2">Description<input value={form.description ?? ""} onChange={(e) => set("description", e.target.value || null)} className={cx(field, "h-10")} /></label>
          </div>
        </DisclosureSection>
      </Group>

      <Group title="Focus" description="Where and at what stage you look. Startups outside these are filtered out before anything is researched.">
        <ChoiceInput label="Geography" hint="The startup must be headquartered in one of these countries." options={COUNTRY_OPTIONS} value={form.allowed_countries} onChange={(v) => set("allowed_countries", v)} placeholder="Choose at least one country" />
        <div>
          <p className="text-body font-medium text-ink">Stages</p>
          <div role="group" aria-label="Funding stages" className="mt-2 flex flex-wrap gap-2">
            {FUNDING_STAGES.filter((s) => s !== "unknown").map((s) => {
              const on = form.allowed_stages.includes(s);
              return (
                <button
                  key={s}
                  type="button"
                  role="checkbox"
                  aria-checked={on}
                  onClick={() => set("allowed_stages", on ? form.allowed_stages.filter((x) => x !== s) : [...form.allowed_stages, s])}
                  className={cx("h-8 rounded-md border px-3 text-meta", on ? "border-accent bg-accent-soft font-medium text-accent" : "border-line-strong text-ink-2 hover:bg-sunken")}
                >
                  {on && <span aria-hidden="true">✓ </span>}{STAGE_LABELS[s]}
                </button>
              );
            })}
          </div>
        </div>
        <ChoiceInput label="Sectors" hint="Pick from the list, or add your own." options={CORE_SECTOR_OPTIONS} allowCustom value={form.included_sectors} onChange={(v) => set("included_sectors", v)} />
      </Group>

      <Group title="Qualification" description="How strict to be.">
        <div className="grid gap-6 sm:grid-cols-2">
          <label className="block text-body font-medium text-ink">Minimum fit
            <p className="text-meta font-normal text-ink-3">Startups scoring below this don’t become opportunities.</p>
            <select className={cx(field, "h-10")} value={form.minimum_fit_score} onChange={(e) => set("minimum_fit_score", Number(e.target.value))}>
              {MIN_SCORE_OPTIONS.map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </label>
          <label className="block text-body font-medium text-ink">Maximum announcement age
            <p className="text-meta font-normal text-ink-3">Older funding news is skipped.</p>
            <select className={cx(field, "h-10")} value={form.max_announcement_age_hours} onChange={(e) => set("max_announcement_age_hours", Number(e.target.value))}>
              {MAX_AGE_HOUR_OPTIONS.map((h) => <option key={h} value={h}>{hours(h)}</option>)}
            </select>
          </label>
        </div>
      </Group>

      <Group title="Priorities" description="Preferences that raise or lower the fit score, without excluding anyone outright.">
        <ChoiceInput label="Preferred subsectors" hint="Pick from the list, or add your own." options={SUBSECTOR_OPTIONS} allowCustom value={form.preferred_subsectors} onChange={(v) => set("preferred_subsectors", v)} />
        <ChoiceInput label="Business models" options={BUSINESS_MODEL_OPTIONS} value={form.preferred_business_models} onChange={(v) => set("preferred_business_models", v)} />
        <ChoiceInput label="Areas to avoid" hint="Startups in these areas score lower." options={EXCLUDED_OPTIONS} allowCustom value={form.excluded_sectors} onChange={(v) => set("excluded_sectors", v)} />
      </Group>

      <div className="py-2">
        <DisclosureSection title="Advanced scoring" summary={`Weights total ${total}/100`} className="border-t-0">
          <p className="mb-5 max-w-2xl text-meta text-ink-2">How much each factor counts toward the 100-point fit score. Most teams never need to change this.</p>
          <div className="space-y-5">
            {form.criteria.map((c, i) => (
              <div key={c.criterion_key} className="grid gap-x-4 gap-y-2 sm:grid-cols-[1.5rem_1fr_5rem]">
                <input type="checkbox" className="mt-1 size-4 accent-[var(--accent)]" checked={c.enabled} onChange={(e) => setCriterion(i, { enabled: e.target.checked })} aria-label={`Count ${c.display_name}`} />
                <div>
                  <p className="text-body font-medium text-ink">{c.display_name} {DETERMINISTIC[c.criterion_key] && <span className="text-meta font-normal text-ink-3">({DETERMINISTIC[c.criterion_key]})</span>}</p>
                  <textarea rows={2} className={cx(field, "!mt-1 py-2 text-meta")} value={c.description} onChange={(e) => setCriterion(i, { description: e.target.value })} aria-label={`${c.display_name} description`} />
                </div>
                <input type="number" min={0} max={100} className={cx(field, "!mt-0 h-10")} value={c.weight} onChange={(e) => setCriterion(i, { weight: Number(e.target.value) })} aria-label={`${c.display_name} weight`} />
              </div>
            ))}
          </div>
          <p role="status" className={cx("mt-4 text-meta font-medium", total === 100 ? "text-ok" : "text-bad")}>{total === 100 ? "Weights total 100." : `Weights total ${total}. They must add up to 100 before you can save.`}</p>

          <div className="mt-8 grid gap-10 md:grid-cols-2">
            <div>
              <h3 className="text-body font-medium text-ink">Recency bands</h3>
              <p className="text-meta text-ink-3">Points for how recently the round was announced. Older than the last band scores 0.</p>
              {form.recency_bands.map((b, i) => (
                <div key={i} className="mt-2 flex items-center gap-2 text-meta text-ink-2">
                  Within
                  <select aria-label={`Band ${i + 1} hours`} className={cx(field, "!mt-0 h-9 w-24")} value={b.max_hours} onChange={(e) => set("recency_bands", form.recency_bands.map((x, j) => (j === i ? { ...x, max_hours: Number(e.target.value) } : x)))}>
                    {RECENCY_HOUR_OPTIONS.map((h) => <option key={h} value={h}>{h}</option>)}
                  </select>
                  hours →
                  <select aria-label={`Band ${i + 1} points`} className={cx(field, "!mt-0 h-9 w-20")} value={b.points} onChange={(e) => set("recency_bands", form.recency_bands.map((x, j) => (j === i ? { ...x, points: Number(e.target.value) } : x)))}>
                    {Array.from({ length: recencyWeight + 1 }, (_, n) => n).map((n) => <option key={n} value={n}>{n}</option>)}
                  </select>
                  pts
                </div>
              ))}
            </div>
            <div>
              <h3 className="text-body font-medium text-ink">Stage points</h3>
              <p className="text-meta text-ink-3">Points for the stage-fit factor, per stage you accept.</p>
              {form.allowed_stages.map((s) => (
                <div key={s} className="mt-2 flex items-center gap-2 text-meta text-ink-2">
                  <span className="w-28">{STAGE_LABELS[s]}</span>
                  <select aria-label={`${STAGE_LABELS[s]} points`} className={cx(field, "!mt-0 h-9 w-20")} value={form.stage_points[s] ?? 0} onChange={(e) => set("stage_points", { ...form.stage_points, [s]: Number(e.target.value) })}>
                    {Array.from({ length: stageWeight + 1 }, (_, n) => n).map((n) => <option key={n} value={n}>{n}</option>)}
                  </select>
                </div>
              ))}
            </div>
          </div>
        </DisclosureSection>
      </div>

      {/* One primary action for the whole page; it appears once there is something to save. */}
      <div className={cx("sticky bottom-[4.5rem] z-10 -mx-4 border-t border-line bg-bg/90 px-4 py-3 backdrop-blur transition-opacity duration-200 sm:-mx-8 sm:px-8 lg:bottom-0", dirty || result ? "opacity-100" : "pointer-events-none opacity-0")} aria-hidden={!(dirty || result)}>
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" onClick={submit} disabled={pending || !dirty || total !== 100} className={buttonClass("primary")}>{pending ? "Saving…" : "Save changes"}</button>
          {dirty && <button type="button" onClick={discard} className={buttonClass("ghost")}>Discard</button>}
          <p className="text-meta text-ink-3">{dirty ? `Saving creates version ${version + 1}. Past scores keep the version they were scored under.` : null}</p>
          <div role="status" aria-live="polite" className="text-meta">
            {total !== 100 && dirty && <span className="text-bad">Weights must total 100.</span>}
            {result?.ok && <span className="text-ok">{result.message}</span>}
            {result && !result.ok && <ul className="text-bad">{result.errors.map((e, i) => <li key={i}>{e}</li>)}</ul>}
          </div>
        </div>
      </div>
    </div>
  );
}
