import { describe, expect, it } from "vitest";
import { confidenceFor, EVIDENCE_RANK, fundingConflict, mergeInvestorEntries, samePerson, type InvestorEntry } from "@/lib/investors/evidence";
import type { StartupProfile } from "@/lib/gemini/schemas";

const profile = (over: Partial<StartupProfile> = {}): StartupProfile => ({
  company_name: "Example", website: null, description: null, sector: null, subsector: null, business_model: null, hq_city: null, hq_country: null, founded_year: null,
  founders: [], product: null, target_customer: null, technology: null, traction: [], customers: [], partnerships: [], funding_history: [], market: null,
  competitive_differentiation: null, source_urls: [], unknowns: [], ...over,
});
const entry = (over: Partial<InvestorEntry> = {}): InvestorEntry => ({
  sourceKey: "stellaris_vp", sourceName: "Stellaris Venture Partners", pageUrl: "https://inv.example/portfolio/example", companyName: "Example", website: "https://example.ai",
  sector: "AI", stage: "seed", partneredYear: 2026, location: "Bengaluru, India", description: "Voice AI for banks", founders: [{ name: "Aarav Mehta", role: "CEO" }],
  coInvestors: ["Acme Capital"], rationale: ["experienced founding team"], status: "active", ...over,
});

describe("investor evidence merge", () => {
  it("fills missing fields and records first-party provenance", () => {
    const r = mergeInvestorEntries(profile(), [entry()]);
    expect(r.profile.website).toBe("https://example.ai");
    expect(r.profile.sector).toBe("AI");
    expect(r.profile.founders).toEqual([{ name: "Aarav Mehta", role: "CEO", background: null, linkedin_url: null }]);
    expect(r.evidence.every((e) => e.evidenceType === "investor_first_party" && e.sourceUrl)).toBe(true);
    expect(r.conflicts).toEqual([]);
  });

  it("never overwrites existing research values (a weaker or different claim is kept as evidence only)", () => {
    const base = profile({ website: "https://example.com", sector: "Vertical AI", description: "Own description", founders: [{ name: "Aarav K. Mehta", role: null, background: "Ex-bank", linkedin_url: null }] });
    const r = mergeInvestorEntries(base, [entry()]);
    expect(r.profile.website).toBe("https://example.com");
    expect(r.profile.sector).toBe("Vertical AI");
    expect(r.profile.description).toBe("Own description");
    // same person (first+last token match): role is filled, background untouched, no duplicate founder
    expect(r.profile.founders).toHaveLength(1);
    expect(r.profile.founders[0]).toMatchObject({ name: "Aarav K. Mehta", role: "CEO", background: "Ex-bank" });
  });

  it("flags a website conflict instead of replacing, and agreement raises confidence", () => {
    const c = mergeInvestorEntries(profile({ website: "https://other.io" }), [entry()]);
    expect(c.conflicts).toEqual([expect.objectContaining({ field: "website", existing: "https://other.io", other: "https://example.ai" })]);
    expect(c.evidence.find((e) => e.fieldKey === "website")?.conflict).toBeTruthy();
    const a = mergeInvestorEntries(profile({ website: "https://www.example.ai/" }), [entry()]);
    expect(a.conflicts).toEqual([]);
    expect(a.evidence.find((e) => e.fieldKey === "website")?.confidence).toBe("high");
  });

  it("does not add founders when none overlap with research (flags it instead)", () => {
    const r = mergeInvestorEntries(profile({ founders: [{ name: "Someone Else", role: "CEO", background: null, linkedin_url: null }] }), [entry()]);
    expect(r.profile.founders.map((f) => f.name)).toEqual(["Someone Else"]);
    expect(r.conflicts.map((c) => c.field)).toContain("founders");
  });

  it("never fills geography (it feeds the hard filter) or touches funding data", () => {
    const r = mergeInvestorEntries(profile(), [entry({ location: "Bengaluru, India" })]);
    expect(r.profile.hq_country).toBeNull();
    expect(r.profile.hq_city).toBeNull();
    expect(r.evidence.find((e) => e.fieldKey === "location")?.value).toBe("Bengaluru, India");
  });

  it("keeps stage, co-investors and rationale as evidence only", () => {
    const r = mergeInvestorEntries(profile(), [entry()]);
    expect(r.evidence.map((e) => e.fieldKey)).toEqual(expect.arrayContaining(["portfolio_membership", "co_investors", "investment_rationale"]));
    expect(JSON.stringify(r.profile)).not.toMatch(/Acme Capital|experienced founding team/);
  });
});

describe("conflicts, confidence, ranking", () => {
  const f = (amount: number, sourceKey: string) => ({ value: { amount, currency: "USD" }, sourceKey, evidenceType: "reputable_media" as const });
  it("flags $3M vs $3.2M but not rounding-level differences", () => {
    expect(fundingConflict("funding_amount", [f(3_000_000, "a"), f(3_200_000, "b")])).toHaveLength(2);
    expect(fundingConflict("funding_amount", [f(3_000_000, "a"), f(3_050_000, "b")])).toBeNull();
    expect(fundingConflict("funding_amount", [f(3_000_000, "a")])).toBeNull();
  });
  it("flags differing stages", () => {
    const s = (v: string, k: string) => ({ value: v, sourceKey: k, evidenceType: "reputable_media" as const });
    expect(fundingConflict("funding_stage", [s("seed", "a"), s("pre-seed", "b")])).toHaveLength(2);
    expect(fundingConflict("funding_stage", [s("seed", "a"), s("seed", "b")])).toBeNull();
  });
  it("ranks first-party above media above database above search, and gives high confidence only for agreement", () => {
    expect(EVIDENCE_RANK.investor_first_party).toBeGreaterThan(EVIDENCE_RANK.reputable_media);
    expect(EVIDENCE_RANK.reputable_media).toBeGreaterThan(EVIDENCE_RANK.database);
    expect(EVIDENCE_RANK.database).toBeGreaterThan(EVIDENCE_RANK.search_result);
    expect(confidenceFor("investor_first_party", 1)).toBe("medium");
    expect(confidenceFor("search_result", 1)).toBe("low");
    expect(confidenceFor("search_result", 2)).toBe("high");
  });
  it("matches people tolerantly", () => {
    expect(samePerson("Aarav Mehta", "Aarav K. Mehta")).toBe(true);
    expect(samePerson("Dr. Aarav Mehta", "aarav mehta")).toBe(true);
    expect(samePerson("Aarav Mehta", "Asha Rao")).toBe(false);
  });
});
