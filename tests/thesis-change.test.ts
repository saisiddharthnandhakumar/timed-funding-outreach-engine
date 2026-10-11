import { describe, expect, it } from "vitest";
import { computeAssessment } from "@/lib/scoring/compute";
import { evaluateHardFilters } from "@/lib/pipeline/filters";
import { DEFAULT_CRITERIA, makeThesis } from "./helpers";

/**
 * Pure-logic proof of the thesis-versioning contract. The database-level proof
 * (real save_thesis_version RPC + immutable stored assessment) lives in
 * tests/integration/supabase.test.ts and runs when Supabase credentials are present.
 */
describe("thesis changes", () => {
  const modelScores = { sector_fit: 20, technology_defensibility: 10, geography_fit: 10, market_attractiveness: 8, founder_quality: 6, traction: 5 };

  it("a new thesis version changes subsequent evaluation; the old stored assessment is unchanged", () => {
    const v1 = makeThesis({ version: 1, minimum_fit_score: 70 });
    const a1 = computeAssessment({ thesis: v1, criteria: DEFAULT_CRITERIA, modelScores, stage: "seed", ageHours: 3 });
    // What the pipeline persists with every assessment (immutable audit copy).
    const stored = structuredClone({ thesis_version: v1.version, total: a1.total_score, qualified: a1.qualified, snapshot: { min: v1.minimum_fit_score, criteria: DEFAULT_CRITERIA } });

    // Operator edits the thesis in Settings → saved as version 2 (higher bar + changed weights).
    const v2 = makeThesis({ version: 2, minimum_fit_score: 95 });
    const criteriaV2 = DEFAULT_CRITERIA.map((c) => (c.criterion_key === "sector_fit" ? { ...c, weight: 30 } : c.criterion_key === "traction" ? { ...c, weight: 5 } : c));
    const a2 = computeAssessment({ thesis: v2, criteria: criteriaV2, modelScores: { ...modelScores, sector_fit: 28 }, stage: "seed", ageHours: 3 });

    expect(a1.total_score).toBe(20 + 10 + 15 + 10 + 8 + 6 + 5 + 5);
    expect(a1.qualified).toBe(true);
    expect(a2.qualified).toBe(false); // new threshold applied to the next evaluation
    expect(a2.criterion_scores.sector_fit).toBe(28);
    expect(a2.criterion_scores.traction).toBe(5); // clamped to the new, lower weight
    // Old record is untouched by the edit.
    expect(stored).toMatchObject({ thesis_version: 1, total: 79, qualified: true, snapshot: { min: 70 } });
  });

  it("hard filters follow the new thesis too", () => {
    const now = new Date("2026-10-11T12:00:00Z");
    const input = { isFundingAnnouncement: true, isIndianStartup: true, hqCountry: "India", stage: "series-a", announcedAt: new Date(now.getTime() - 3_600_000), now };
    expect(evaluateHardFilters(makeThesis(), input).reason).toBe("wrong_stage");
    expect(evaluateHardFilters(makeThesis({ allowed_stages: ["seed", "series-a"] }), input).passed).toBe(true);
  });
});
