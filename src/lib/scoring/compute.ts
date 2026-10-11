import type { CriterionRow, RecencyBand, ThesisRow } from "@/types/domain";

/** Keys scored by code, never by the model. */
export const DETERMINISTIC_KEYS = ["stage_fit", "recency"] as const;

export class ScoringConfigError extends Error {}

export function sumEnabledWeights(criteria: Pick<CriterionRow, "weight" | "enabled">[]): number {
  return criteria.filter((c) => c.enabled).reduce((s, c) => s + c.weight, 0);
}

export function assertWeightsTotal100(criteria: Pick<CriterionRow, "weight" | "enabled">[]): void {
  const total = sumEnabledWeights(criteria);
  if (total !== 100) throw new ScoringConfigError(`Enabled scoring weights must total 100 (got ${total})`);
}

/** Criteria the model must score = enabled and not computed deterministically. */
export function modelCriteriaOf(criteria: CriterionRow[], thesis: Pick<ThesisRow, "recency_bands" | "stage_points">): CriterionRow[] {
  return criteria.filter((c) => c.enabled && !isDeterministic(c.criterion_key, thesis));
}

function isDeterministic(key: string, thesis: Pick<ThesisRow, "recency_bands" | "stage_points">): boolean {
  if (key === "recency") return thesis.recency_bands.length > 0;
  if (key === "stage_fit") return Object.keys(thesis.stage_points).length > 0;
  return false;
}

/** First band whose max_hours covers the age; 0 beyond the last band. Clamped to the criterion weight. */
export function recencyPoints(bands: RecencyBand[], ageHours: number, weight: number): number {
  const sorted = [...bands].sort((a, b) => a.max_hours - b.max_hours);
  const band = sorted.find((b) => ageHours <= b.max_hours);
  return clamp(band?.points ?? 0, 0, weight);
}

export function stagePoints(points: Record<string, number>, stage: string, weight: number): number {
  return clamp(points[stage] ?? 0, 0, weight);
}

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

export interface ComputeInput {
  thesis: Pick<ThesisRow, "minimum_fit_score" | "recency_bands" | "stage_points" | "version">;
  criteria: CriterionRow[];
  /** Raw per-criterion scores returned by the model (untrusted). */
  modelScores: Record<string, unknown>;
  stage: string;
  ageHours: number;
}

export interface ComputedAssessment {
  criterion_scores: Record<string, number>;
  total_score: number;
  qualified: boolean;
  /** Human-readable notes about anything corrected (clamping, missing keys). */
  warnings: string[];
}

/**
 * Application-side scoring: never trusts model arithmetic.
 *  - every enabled criterion gets an integer in [0, weight]
 *  - model values above the configured max are clamped (and noted)
 *  - missing/non-numeric model values score 0 (and are noted)
 *  - total is the sum of enabled criteria; qualified = total >= minimum_fit_score
 */
export function computeAssessment(input: ComputeInput): ComputedAssessment {
  assertWeightsTotal100(input.criteria);
  const warnings: string[] = [];
  const scores: Record<string, number> = {};
  for (const c of input.criteria.filter((x) => x.enabled)) {
    let value: number;
    if (c.criterion_key === "recency" && input.thesis.recency_bands.length > 0) {
      value = recencyPoints(input.thesis.recency_bands, input.ageHours, c.weight);
    } else if (c.criterion_key === "stage_fit" && Object.keys(input.thesis.stage_points).length > 0) {
      value = stagePoints(input.thesis.stage_points, input.stage, c.weight);
    } else {
      const raw = input.modelScores[c.criterion_key];
      if (typeof raw !== "number" || !Number.isFinite(raw)) {
        warnings.push(`${c.criterion_key}: model returned no numeric score; scored 0`);
        value = 0;
      } else {
        value = Math.round(raw);
        if (value > c.weight) {
          warnings.push(`${c.criterion_key}: model scored ${value} > max ${c.weight}; clamped`);
          value = c.weight;
        }
        if (value < 0) value = 0;
      }
    }
    scores[c.criterion_key] = value;
  }
  const total = Object.values(scores).reduce((s, v) => s + v, 0);
  return { criterion_scores: scores, total_score: total, qualified: total >= input.thesis.minimum_fit_score, warnings };
}
