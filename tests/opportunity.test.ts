import { describe, expect, it } from "vitest";
import { applyFilters, advancedCount, filterOptions, parseFilters } from "@/lib/opportunity/filters";
import { byPriority, fitTier, needsAttention, toOpportunity, type Opportunity, type OpportunityRow } from "@/lib/opportunity/model";
import { buildAngle, buildMessageChecks, buildReadiness, buildWhyFit, buildWhyNow } from "@/lib/opportunity/why";
import { draftState, rejectionLabel, roundStatusLabel, articleStatusLabel } from "@/lib/labels";

const NOW = new Date("2026-10-12T12:00:00Z");
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 3_600_000).toISOString();

function row(over: Partial<{ id: string; name: string; fit: number; announced: string | null; status: string | null; stage: string; amount: number | null; currency: string; signals: string[]; sector: string; source: string }> = {}): OpportunityRow {
  return {
    assessment: { total_score: over.fit ?? 85, positive_signals: over.signals ?? ["Vertical AI focus", "Strong technical team"], assessed_at: hoursAgo(5) },
    startup: { id: over.id ?? "s1", name: over.name ?? "Nimbus AI", description: "AI procurement automation", sector: over.sector ?? "AI/ML", subsector: "Vertical AI", business_model: "B2B", hq_city: "Bengaluru", hq_country: "India" },
    round: {
      stage: over.stage ?? "seed",
      amount: over.amount === undefined ? 180_000_000 : over.amount,
      currency: over.currency ?? "INR",
      earliest_source_published_at: over.announced === undefined ? hoursAgo(2) : over.announced,
      funding_round_investors: [{ is_lead: true, investors: { name: "Peak XV" } }, { is_lead: false, investors: { name: "Elevation" } }],
      funding_round_sources: [{ sources: { name: "Inc42" } }, { sources: { name: "Entrackr" } }, { sources: { name: "Inc42" } }],
    },
    outreach: over.status === undefined ? { id: "o1", status: "generated", subject: "Congrats", recipient_name: "Rahul Shah" } : over.status === null ? null : { id: "o1", status: over.status, subject: "Congrats", recipient_name: "Rahul Shah" },
  };
}
const opp = (over: Parameters<typeof row>[0] = {}) => toOpportunity(row(over), NOW);

describe("toOpportunity", () => {
  it("builds the scout-facing view-model", () => {
    const o = opp();
    expect(o.name).toBe("Nimbus AI");
    expect(o.amountText).toBe("₹18 Cr");
    expect(o.location).toBe("Bengaluru, India");
    expect(o.sources).toEqual(["Inc42", "Entrackr"]);
    expect(o.draftState).toBe("ready");
    expect(o.whyNow.summary).toBe("Seed round of ₹18 Cr announced 2h ago, led by Peak XV.");
    expect(o.whyFit).toEqual(["Vertical AI focus", "Strong technical team"]);
  });
  it("copes with sparse data without filler", () => {
    const o = opp({ announced: null, amount: null, signals: [], status: null });
    expect(o.draftState).toBe("none");
    expect(o.whyFit).toEqual(["Vertical AI", "AI/ML", "B2B"]);
    expect(o.whyNow.summary).toBe("Seed round announced, led by Peak XV.");
  });
});

describe("priority and attention", () => {
  it("orders by fit desc, then freshest announcement", () => {
    const list = [opp({ id: "a", fit: 80, announced: hoursAgo(1) }), opp({ id: "b", fit: 90, announced: hoursAgo(30) }), opp({ id: "c", fit: 90, announced: hoursAgo(3) }), opp({ id: "d", fit: 80, announced: null })];
    expect(list.sort(byPriority).map((o) => o.startupId)).toEqual(["c", "b", "a", "d"]);
  });
  it("needs attention only while undecided and recent", () => {
    expect(needsAttention(opp({ status: "generated" }), NOW)).toBe(true);
    expect(needsAttention(opp({ status: null }), NOW)).toBe(true);
    expect(needsAttention(opp({ status: "approved" }), NOW)).toBe(false);
    expect(needsAttention(opp({ status: "sent" }), NOW)).toBe(false);
    expect(needsAttention(opp({ status: "generated", announced: hoursAgo(24 * 9) }), NOW)).toBe(false);
  });
  it("tiers fit in words", () => {
    expect(fitTier(87)).toBe("strong");
    expect(fitTier(72, 70)).toBe("good");
    expect(fitTier(60, 70)).toBe("low");
    expect(fitTier(null)).toBe("none");
  });
});

describe("filters", () => {
  const list: Opportunity[] = [
    opp({ id: "new-ready", status: "generated", fit: 90 }),
    opp({ id: "approved", status: "approved", fit: 82, stage: "pre-seed", sector: "Fintech", source: "x" }),
    opp({ id: "usd", status: "sent", fit: 75, amount: 400_000, currency: "USD", announced: hoursAgo(100) }),
  ];
  it("parses only whitelisted values", () => {
    expect(parseFilters({ f: "ready", age: "48", min: "80", size: "mid", stage: "seed" })).toMatchObject({ status: "ready", maxAgeHours: 48, minScore: 80, size: "mid", stage: "seed" });
    expect(parseFilters({ f: "bogus", age: "13", min: "1", size: "huge" })).toEqual({ status: "all", stage: undefined, sector: undefined, location: undefined, source: undefined, size: undefined, maxAgeHours: undefined, minScore: undefined });
  });
  it("filters by status chips", () => {
    const ids = (f: string) => applyFilters(list, parseFilters({ f }), NOW).map((o) => o.startupId);
    expect(ids("ready")).toEqual(["new-ready"]);
    expect(ids("reviewed")).toEqual(["approved", "usd"]);
    expect(ids("new")).toEqual(["new-ready"]);
    expect(ids("all")).toHaveLength(3);
  });
  it("applies advanced filters", () => {
    expect(applyFilters(list, parseFilters({ stage: "pre-seed" }), NOW).map((o) => o.startupId)).toEqual(["approved"]);
    expect(applyFilters(list, parseFilters({ min: "80" }), NOW)).toHaveLength(2);
    expect(applyFilters(list, parseFilters({ age: "24" }), NOW)).toHaveLength(2);
    expect(applyFilters(list, parseFilters({ size: "small" }), NOW).map((o) => o.startupId)).toEqual(["usd"]); // $400K ≈ ₹3.4 Cr
    expect(applyFilters(list, parseFilters({ size: "mid" }), NOW)).toHaveLength(2); // ₹18 Cr rounds
    expect(advancedCount(parseFilters({ stage: "seed", min: "70", f: "ready" }))).toBe(2);
  });
  it("lists the options present in the data", () => {
    expect(filterOptions(list).stages).toEqual(["pre-seed", "seed"]);
  });
});

describe("derived copy", () => {
  it("says nothing about sparse rounds beyond the facts", () => {
    const w = buildWhyNow({ name: "Acme", stage: "unknown", amount: null, currency: null, announcedAt: null, investors: [], now: NOW });
    expect(w.summary).toBe("Funding round announced.");
    expect(w.points).toEqual([]);
  });
  it("timeliness follows recency", () => {
    const at = (h: number) => buildWhyNow({ name: "A", stage: "seed", amount: null, currency: null, announcedAt: hoursAgo(h), investors: [], now: NOW }).points[0];
    expect(at(2)).toMatch(/still current/);
    expect(at(40)).toMatch(/recent enough/);
    expect(at(100)).toMatch(/closing/);
  });
  it("falls back to classification when no signals", () => {
    expect(buildWhyFit({ signals: [], sector: "Fintech", subsector: null, businessModel: "B2B" })).toEqual(["Fintech", "B2B"]);
  });
  it("builds an angle only from real signals", () => {
    expect(buildAngle({ founderFirstName: "Rahul", stage: "seed", signals: ["Strong vertical AI alignment."], traction: ["10 pilots"], customers: [] })).toEqual({
      angle: "Congratulate Rahul on the Seed round, then lead with strong vertical AI alignment.",
      talkingPoints: ["Strong vertical AI alignment", "10 pilots"],
    });
    expect(buildAngle({ founderFirstName: null, stage: null, signals: [], traction: [], customers: [] }).angle).toBeNull();
  });
  it("derives draft readiness", () => {
    expect(buildReadiness({ exists: false, status: null, recipientName: null, recipientEmail: null, emailVerification: null }).state).toBe("no-draft");
    expect(buildReadiness({ exists: true, status: "generated", recipientName: "R", recipientEmail: null, emailVerification: null }).state).toBe("needs-recipient");
    expect(buildReadiness({ exists: true, status: "generated", recipientName: "R", recipientEmail: "r@x.com", emailVerification: "publicly_confirmed" }).state).toBe("needs-review");
    expect(buildReadiness({ exists: true, status: "approved", recipientName: "R", recipientEmail: "r@x.com", emailVerification: "publicly_confirmed" }).state).toBe("ready");
  });
  it("checks the draft against facts", () => {
    const checks = buildMessageChecks({ startupName: "Nimbus AI", stage: "seed", amountText: "₹18 Cr", recipientName: "Rahul Shah", recipientEmail: "r@nimbus.ai", emailVerification: "pattern_guessed", body: "Hi Rahul, congrats on Nimbus AI's seed round.", signalCount: 2 });
    const by = Object.fromEntries(checks.map((c) => [c.label, c.ok]));
    expect(by["Addressed to Rahul"]).toBe(true);
    expect(by["Mentions Nimbus AI"]).toBe(true);
    expect(by["References the recent funding"]).toBe(true);
    expect(by["Recipient address is not verified"]).toBe(false);
  });
});

describe("labels", () => {
  it("humanises machine codes", () => {
    expect(rejectionLabel("below_threshold")).toBe("Not a fit");
    expect(rejectionLabel("already_contacted")).toBe("Previously contacted");
    expect(rejectionLabel("announcement_too_old")).toBe("Too old");
    expect(rejectionLabel("wrong_stage")).toBe("Stage outside thesis");
    expect(rejectionLabel("wrong_geography")).toBe("Outside target market");
    expect(rejectionLabel("some_new_code")).toBe("Some new code");
    expect(rejectionLabel(null)).toBeNull();
    expect(articleStatusLabel("processing")).toBe("Reviewing");
    expect(roundStatusLabel("enriching")).toBe("Reviewing");
  });
  it("maps outreach status to workflow state", () => {
    expect(draftState("generated")).toBe("ready");
    expect(draftState("draft_created")).toBe("ready");
    expect(draftState("approved")).toBe("approved");
    expect(draftState("cancelled")).toBe("rejected");
    expect(draftState(undefined)).toBe("none");
  });
});

import { isUuid } from "@/lib/util/text";
describe("isUuid", () => {
  it("accepts canonical uuids only", () => {
    expect(isUuid("5ae1806d-81a7-4eaa-b652-c5c968f0e5b4")).toBe(true);
    expect(isUuid("abc")).toBe(false);
    expect(isUuid("5ae1806d-81a7-4eaa-b652-c5c968f0e5b4; drop table")).toBe(false);
  });
});
