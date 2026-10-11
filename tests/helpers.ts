import type { CriterionRow, ThesisRow } from "@/types/domain";

export const DEFAULT_CRITERIA: CriterionRow[] = [
  ["sector_fit", 25], ["technology_defensibility", 15], ["stage_fit", 15], ["geography_fit", 10],
  ["market_attractiveness", 10], ["founder_quality", 10], ["traction", 10], ["recency", 5],
].map(([key, weight], i) => ({
  criterion_key: key as string, display_name: key as string, description: "", weight: weight as number, enabled: true, sort_order: i,
}));

export function makeThesis(over: Partial<ThesisRow> = {}): ThesisRow {
  return {
    id: "t1", name: "Default", description: null, natural_language_thesis: "x", active: true, version: 1,
    allowed_countries: ["India"], allowed_stages: ["pre-seed", "seed"], included_sectors: [], preferred_subsectors: [],
    excluded_sectors: [], preferred_business_models: [], max_announcement_age_hours: 24, minimum_fit_score: 70,
    recency_bands: [{ max_hours: 6, points: 5 }, { max_hours: 12, points: 4 }, { max_hours: 18, points: 3 }, { max_hours: 24, points: 2 }],
    stage_points: { "pre-seed": 15, seed: 15 }, created_at: new Date().toISOString(), ...over,
  };
}
