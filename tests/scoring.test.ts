import { describe, expect, it } from "vitest";
import { assertWeightsTotal100, computeAssessment, modelCriteriaOf, recencyPoints, sumEnabledWeights } from "@/lib/scoring/compute";
import { DEFAULT_CRITERIA, makeThesis } from "./helpers";

const thesis = makeThesis();
const modelScores = { sector_fit: 23, technology_defensibility: 13, geography_fit: 10, market_attractiveness: 8, founder_quality: 7, traction: 6 };

describe("score validation", () => {
  it("default weights total 100; invalid totals are rejected", () => {
    expect(sumEnabledWeights(DEFAULT_CRITERIA)).toBe(100);
    expect(() => assertWeightsTotal100(DEFAULT_CRITERIA)).not.toThrow();
    expect(() => assertWeightsTotal100(DEFAULT_CRITERIA.map((c) => (c.criterion_key === "traction" ? { ...c, weight: 11 } : c)))).toThrow(/total 100/);
    expect(() => assertWeightsTotal100(DEFAULT_CRITERIA.map((c) => (c.criterion_key === "traction" ? { ...c, enabled: false } : c)))).toThrow();
  });
  it("model never scores deterministic criteria", () => {
    expect(modelCriteriaOf(DEFAULT_CRITERIA, thesis).map((c) => c.criterion_key)).not.toContain("recency");
    expect(modelCriteriaOf(DEFAULT_CRITERIA, thesis).map((c) => c.criterion_key)).not.toContain("stage_fit");
  });
  it("final score is computed in code from criterion scores (not model arithmetic)", () => {
    const r = computeAssessment({ thesis, criteria: DEFAULT_CRITERIA, modelScores, stage: "seed", ageHours: 2 });
    // 23+13+15(stage)+10+8+7+6+5(recency 0-6h)
    expect(r.total_score).toBe(87);
    expect(r.qualified).toBe(true);
    expect(r.warnings).toEqual([]);
  });
  it("a criterion score cannot exceed its configured weight (clamped + flagged)", () => {
    const r = computeAssessment({ thesis, criteria: DEFAULT_CRITERIA, modelScores: { ...modelScores, sector_fit: 99, traction: -4 }, stage: "seed", ageHours: 2 });
    expect(r.criterion_scores.sector_fit).toBe(25);
    expect(r.criterion_scores.traction).toBe(0);
    expect(r.warnings.join(" ")).toMatch(/sector_fit.*clamped/);
  });
  it("missing or non-numeric model scores count as 0", () => {
    const r = computeAssessment({ thesis, criteria: DEFAULT_CRITERIA, modelScores: { sector_fit: "high" }, stage: "seed", ageHours: 2 });
    expect(r.criterion_scores.sector_fit).toBe(0);
    expect(r.criterion_scores.founder_quality).toBe(0);
    expect(r.total_score).toBe(15 + 5);
  });
  it("recency bands follow configuration", () => {
    const bands = thesis.recency_bands;
    expect([1, 6, 7, 12, 13, 18, 19, 24, 25].map((h) => recencyPoints(bands, h, 5))).toEqual([5, 5, 4, 4, 3, 3, 2, 2, 0]);
    expect(recencyPoints([{ max_hours: 6, points: 50 }], 1, 5)).toBe(5); // clamped to weight
  });
  it("qualification uses the configured threshold", () => {
    const low = { ...modelScores, sector_fit: 5, technology_defensibility: 3 };
    const r = computeAssessment({ thesis, criteria: DEFAULT_CRITERIA, modelScores: low, stage: "seed", ageHours: 2 });
    expect(r.total_score).toBe(5 + 3 + 15 + 10 + 8 + 7 + 6 + 5);
    expect(r.qualified).toBe(r.total_score >= 70); expect(r.qualified).toBe(false);
    expect(computeAssessment({ thesis: makeThesis({ minimum_fit_score: 55 }), criteria: DEFAULT_CRITERIA, modelScores: low, stage: "seed", ageHours: 2 }).qualified).toBe(true);
  });
});
