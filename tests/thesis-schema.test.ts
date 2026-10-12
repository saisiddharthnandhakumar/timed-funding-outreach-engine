import { describe, expect, it } from "vitest";
import { ThesisInputSchema } from "@/lib/thesis/schema";
import { DEFAULT_CRITERIA, makeThesis } from "./helpers";

const t = makeThesis();
const base = () => ({
  name: "Default", description: null, natural_language_thesis: "We identify Indian pre-seed and seed startups building AI-native B2B software.",
  allowed_countries: ["India"], allowed_stages: ["pre-seed", "seed"], included_sectors: ["AI/ML", "Deeptech"], preferred_subsectors: ["Vertical AI"],
  excluded_sectors: ["undifferentiated AI wrappers"], preferred_business_models: ["B2B", "B2B2C"], max_announcement_age_hours: 24, minimum_fit_score: 70,
  recency_bands: t.recency_bands, stage_points: t.stage_points,
  criteria: DEFAULT_CRITERIA.map((c) => ({ ...c, description: c.description ?? "" })),
});
const errs = (over: Record<string, unknown>) => {
  const r = ThesisInputSchema.safeParse({ ...base(), ...over });
  return r.success ? [] : r.error.issues.map((i) => i.message);
};

describe("thesis form validation (dropdown-only fields)", () => {
  it("accepts the default thesis", () => expect(errs({})).toEqual([]));

  it("geography must come from the country list", () => {
    expect(errs({ allowed_countries: ["Atlantis"] }).join()).toMatch(/Geography: only values from the dropdown/);
    expect(errs({ allowed_countries: [] }).join()).toMatch(/At least one country/);
    expect(errs({ allowed_countries: ["India", "Singapore"] })).toEqual([]);
  });

  it("business models are dropdown-only (no custom)", () => {
    expect(errs({ preferred_business_models: ["B2B", "Vibes"] }).join()).toMatch(/Business models: only values from the dropdown/);
  });

  it("sectors / subsectors / excluded areas accept vetted custom labels", () => {
    expect(errs({ included_sectors: ["AI/ML", "Photonics & Quantum Hardware"] })).toEqual([]);
    expect(errs({ preferred_subsectors: ["Vertical AI", "Neuromorphic Chips"] })).toEqual([]);
    expect(errs({ excluded_sectors: ["fast-fashion resale"] })).toEqual([]);
  });

  it("rejects malformed or unsafe custom labels and duplicates", () => {
    expect(errs({ included_sectors: ["<script>alert(1)</script>"] }).join()).toMatch(/custom entries/);
    expect(errs({ included_sectors: ["x"] }).join()).toMatch(/custom entries/);
    expect(errs({ included_sectors: ["a".repeat(80)] }).join()).toMatch(/custom entries/);
    expect(errs({ included_sectors: ["AI/ML", "ai/ml"] }).join()).toMatch(/duplicate/);
  });

  it("numeric controls only accept the offered steps", () => {
    expect(errs({ max_announcement_age_hours: 25 }).join()).toMatch(/choose one of the offered values/);
    expect(errs({ max_announcement_age_hours: 48 })).toEqual([]);
    expect(errs({ minimum_fit_score: 72 }).join()).toMatch(/choose one of the offered values/);
    expect(errs({ minimum_fit_score: 75 })).toEqual([]);
    expect(errs({ recency_bands: [{ max_hours: 7, points: 5 }] }).join()).toMatch(/choose one of the offered values/);
  });

  it("still enforces weights totalling 100", () => {
    const criteria = base().criteria.map((c) => (c.criterion_key === "traction" ? { ...c, weight: 11 } : c));
    expect(errs({ criteria }).join()).toMatch(/total 100/);
  });
});
