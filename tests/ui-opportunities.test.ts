import { describe, expect, it } from "vitest";
import {
  activeFilterCount, buildOpportunity, isActionable, fitLabel, fundingBucket, matchesAdvanced, matchesFilter, matchesQuery, recommendedAngle, sortOpportunities,
  whyNow, windowHoursLeft, workStateOf, type RawOpportunityRow,
} from "@/lib/opportunities/derive";
import { greeting, plural, timeAgo } from "@/lib/format";

const NOW = new Date("2026-10-12T10:00:00Z");
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 3_600_000).toISOString();

function raw(over: Partial<RawOpportunityRow> & { score?: number; announcedHoursAgo?: number; assessedHoursAgo?: number } = {}): RawOpportunityRow {
  return {
    startupId: over.startupId ?? "s1",
    assessment: { total_score: over.score ?? 87, positive_signals: ["Strong vertical AI alignment.", "Enterprise workflow product"], concerns: [], reasoning: "ok", assessed_at: hoursAgo(over.assessedHoursAgo ?? 1), thesis_version: 3 },
    startup: { name: "Nimbus AI", description: "AI procurement for manufacturers.", sector: "AI/ML", subsector: "Vertical AI", hq_city: "Bengaluru", hq_country: "India", website: "https://nimbus.ai", domain: "nimbus.ai", business_model: "B2B", enrichment_status: "completed" },
    round: { stage: "seed", amount: 180_000_000, currency: "INR", earliest_source_published_at: hoursAgo(over.announcedHoursAgo ?? 2), investors: [{ name: "Accel", lead: true }], sources: ["Inc42", "Entrackr"] },
    outreach: over.outreach === undefined ? { id: "o1", status: "generated", recipient_email: null } : over.outreach,
  };
}

describe("fit label", () => {
  it("pairs a word with the number so colour is never the only signal", () => {
    expect(fitLabel(92)).toBe("Strong fit");
    expect(fitLabel(85)).toBe("Strong fit");
    expect(fitLabel(84)).toBe("Good fit");
    expect(fitLabel(70)).toBe("Good fit");
    expect(fitLabel(69)).toBe("Possible fit");
  });
});

describe("why now", () => {
  it("states who led the round and how much of the announcement window is left", () => {
    expect(whyNow({ announcedAt: hoursAgo(2), investors: [{ name: "Accel", lead: true }], maxAgeHours: 24, now: NOW })).toBe("Led by Accel. 22h left in your 24h window.");
  });
  it("says so honestly when the window has closed", () => {
    expect(whyNow({ announcedAt: hoursAgo(30), investors: [], maxAgeHours: 24, now: NOW })).toBe("Past your 24h announcement window.");
  });
  it("names up to two backers when none is marked lead", () => {
    expect(whyNow({ announcedAt: hoursAgo(1), investors: [{ name: "A", lead: false }, { name: "B", lead: false }, { name: "C", lead: false }], maxAgeHours: 24, now: NOW })).toBe("Backed by A and B. 23h left in your 24h window.");
  });
  it("does not invent timing when the thesis window is unknown", () => {
    expect(whyNow({ announcedAt: hoursAgo(1), investors: [], now: NOW })).toBe("Fresh announcement.");
  });
});

describe("recommended angle", () => {
  it("uses the strongest signals, tidied", () => {
    expect(recommendedAngle(["Strong vertical AI alignment.", "Enterprise workflow product"])).toBe("Strong vertical AI alignment; enterprise workflow product");
  });
  it("falls back to the product line, and to nothing (never invents)", () => {
    expect(recommendedAngle([], "Procurement software.")).toBe("Procurement software");
    expect(recommendedAngle([], null)).toBeNull();
  });
});

describe("work state and filters", () => {
  it("treats an unreviewed draft as 'draft ready' and an approved/sent one as 'reviewed'", () => {
    expect(workStateOf("generated", hoursAgo(1), NOW)).toEqual({ state: "draft_ready", isNew: true });
    expect(workStateOf("draft_created", hoursAgo(30), NOW)).toEqual({ state: "draft_ready", isNew: false });
    expect(workStateOf("approved", hoursAgo(1), NOW)).toEqual({ state: "reviewed", isNew: false });
    expect(workStateOf("sent", hoursAgo(1), NOW).state).toBe("reviewed");
    expect(workStateOf(null, hoursAgo(1), NOW)).toEqual({ state: "waiting", isNew: true });
  });
  it("filters All / New / Draft ready / Reviewed", () => {
    const fresh = buildOpportunity(raw(), NOW, 24);
    const reviewed = buildOpportunity(raw({ outreach: { id: "o2", status: "approved", recipient_email: "a@b.co" } }), NOW);
    expect(matchesFilter(fresh, "all")).toBe(true);
    expect(matchesFilter(fresh, "new")).toBe(true);
    expect(matchesFilter(fresh, "draft_ready")).toBe(true);
    expect(matchesFilter(fresh, "reviewed")).toBe(false);
    expect(matchesFilter(reviewed, "reviewed")).toBe(true);
    expect(matchesFilter(reviewed, "new")).toBe(false);
  });
});

describe("today attention", () => {
  it("includes unreviewed opportunities from the last 72 hours only", () => {
    const fresh = buildOpportunity(raw({ assessedHoursAgo: 5 }), NOW, 24);
    const old = buildOpportunity(raw({ assessedHoursAgo: 100 }), NOW, 24);
    const reviewed = buildOpportunity(raw({ outreach: { id: "o", status: "sent", recipient_email: "a@b.co" } }), NOW, 24);
    expect(isActionable(fresh, NOW)).toBe(true);
    expect(isActionable(old, NOW)).toBe(false);
    expect(isActionable(reviewed, NOW)).toBe(false);
  });
});

describe("ordering", () => {
  it("is fit first, then most recently announced (no priority score exists)", () => {
    const a = buildOpportunity(raw({ startupId: "a", score: 80, announcedHoursAgo: 1 }), NOW);
    const b = buildOpportunity(raw({ startupId: "b", score: 90, announcedHoursAgo: 10 }), NOW);
    const c = buildOpportunity(raw({ startupId: "c", score: 90, announcedHoursAgo: 3 }), NOW);
    expect(sortOpportunities([a, b, c]).map((x) => x.id)).toEqual(["c", "b", "a"]);
  });
});

describe("advanced filters", () => {
  const o = buildOpportunity(raw(), NOW);
  it("matches stage, sector, source, score and age", () => {
    expect(matchesAdvanced(o, { stage: "seed", sector: "AI/ML", source: "Inc42", minFit: 80, maxAgeHours: 24 }, NOW)).toBe(true);
    expect(matchesAdvanced(o, { stage: "pre-seed" }, NOW)).toBe(false);
    expect(matchesAdvanced(o, { sector: "Fintech" }, NOW)).toBe(false);
    expect(matchesAdvanced(o, { source: "YourStory" }, NOW)).toBe(false);
    expect(matchesAdvanced(o, { minFit: 90 }, NOW)).toBe(false);
    expect(matchesAdvanced(o, { maxAgeHours: 1 }, NOW)).toBe(false);
  });
  it("buckets funding approximately and counts active filters", () => {
    expect(fundingBucket(180_000_000, "INR")).toBe("mid"); // ₹18 Cr
    expect(fundingBucket(1_000_000, "USD")).toBe("mid"); // ~₹8.5 Cr
    expect(fundingBucket(100_000, "USD")).toBe("small");
    expect(fundingBucket(5_000_000, "USD")).toBe("large");
    expect(fundingBucket(null, null)).toBe("undisclosed");
    expect(activeFilterCount({ stage: "seed", minFit: 70 })).toBe(2);
    expect(activeFilterCount({})).toBe(0);
  });
  it("searches name, sector and city", () => {
    expect(matchesQuery(o, "nimbus")).toBe(true);
    expect(matchesQuery(o, "vertical")).toBe(true);
    expect(matchesQuery(o, "bengaluru")).toBe(true);
    expect(matchesQuery(o, "zzz")).toBe(false);
  });
});

describe("announcement window", () => {
  it("reports hours left, or null once closed", () => {
    expect(windowHoursLeft(hoursAgo(2), 24, NOW)).toBe(22);
    expect(windowHoursLeft(hoursAgo(30), 24, NOW)).toBeNull();
    expect(windowHoursLeft(null, 24, NOW)).toBeNull();
  });
});

describe("formatting helpers used by the new UI", () => {
  it("timeAgo uses whole units", () => {
    expect(timeAgo(hoursAgo(2.4), NOW)).toBe("2h ago");
    expect(timeAgo(new Date(NOW.getTime() - 34 * 60_000).toISOString(), NOW)).toBe("34m ago");
    expect(timeAgo(hoursAgo(72), NOW)).toBe("3d ago");
  });
  it("greets by IST hour", () => {
    expect(greeting(new Date("2026-10-12T03:30:00Z"))).toBe("Good morning"); // 09:00 IST
    expect(greeting(new Date("2026-10-12T09:00:00Z"))).toBe("Good afternoon"); // 14:30 IST
    expect(greeting(new Date("2026-10-12T15:00:00Z"))).toBe("Good evening"); // 20:30 IST
  });
  it("pluralises", () => {
    expect(plural(1, "opportunity", "opportunities")).toBe("1 opportunity");
    expect(plural(3, "draft")).toBe("3 drafts");
  });
});
