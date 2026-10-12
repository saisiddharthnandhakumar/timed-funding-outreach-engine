import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/supabase/admin";
import { hasSupabaseEnv } from "@/lib/env";
import { runPipeline } from "@/lib/pipeline/run";
import { DatabaseDraftProvider } from "@/lib/outreach/providers";
import type { InvestorEntry } from "@/lib/investors/evidence";
import { signalToArticle } from "@/lib/investors/adapter";
import { emptySignal } from "@/lib/investors/types";
import { FakeAI, FixtureAdapter, cls } from "./fakes";

/**
 * Acceptance test for the investor/evidence extension, against the real schema with synthetic data (names prefixed
 * "Fixture", source keys test_fixture_*, all deleted afterwards). The investor site and the news site report the SAME
 * raise; a third source throws. Checks: one startup, one round, many sources, first-party evidence, conflicts surfaced,
 * a broken source isolated, and the fit score untouched by investor data.
 */
const suite = hasSupabaseEnv() ? describe : describe.skip;

suite("investor evidence + news in one pipeline run", () => {
  const tag = `test_fixture_inv_${Date.now()}`;
  const keys = { news: `${tag}_news`, inv: `${tag}_investor`, bad: `${tag}_bad` };
  const hoursAgo = (h: number) => new Date(Date.now() - h * 3_600_000);
  const H = { news: "Fixture Orbit raises $3M seed round", inv: "Why we invested in Fixture Orbit" };
  const adapters: Record<string, { fetchLatest(): Promise<any[]>; key: string }> = {
    [keys.news]: new FixtureAdapter(keys.news, [{ sourceUrl: `https://fixture.example/${tag}/news`, headline: H.news, snippet: "Seed", contentText: "x".repeat(700), publishedAt: hoursAgo(3) }]),
    // built exactly as the real investor adapter builds it (headline has no raise/funding words: only the snippet marker lets it through the prefilter)
    [keys.inv]: new FixtureAdapter(keys.inv, [
      signalToArticle(emptySignal({ name: "Fixture Capital" }, { signalType: "why_we_invested", sourceUrl: `https://fixture-investor.example/${tag}/investing-in-orbit`, headline: H.inv, summary: "Why we invested in Orbit.", publishedAt: hoursAgo(2), companyName: "Fixture Orbit Technologies", stage: "seed" })),
    ]),
    [keys.bad]: { key: keys.bad, fetchLatest: async () => { throw new Error("fixture investor site is down"); } },
  };
  const ai = new FakeAI({
    [H.news]: { classification: cls({ company_name: "Fixture Orbit", funding_amount: 3_000_000 }) },
    [H.inv]: { classification: cls({ company_name: "Fixture Orbit Technologies", funding_amount: 3_200_000, lead_investor: "Fixture Capital", investors: ["Fixture Capital"] }) },
  });
  const entry: InvestorEntry = {
    sourceKey: keys.inv, sourceName: "Fixture Capital", pageUrl: "https://fixture-investor.example/portfolio/orbit", companyName: "Fixture Orbit",
    website: "https://fixture-orbit.example", sector: "Vertical AI", stage: "seed", partneredYear: 2026, location: "Bengaluru, India", description: "Orbit builds things",
    founders: [{ name: "Asha Rao", role: "Chief Executive" }, { name: "Ravi Menon", role: "CTO" }], coInvestors: ["Fixture Angels"], rationale: ["experienced founding team"], status: "active",
  };
  const deps = {
    ai,
    createAdapter: (row: { key: string }) => adapters[row.key] as any,
    fetchArticleText: async () => ({ text: "x".repeat(700), links: [] }),
    draftProvider: new DatabaseDraftProvider(),
    enrichContacts: async () => null,
    investorLookup: { gather: async () => [entry] },
  };
  const sourceIds: string[] = [];

  beforeAll(async () => {
    const mk = (key: string, name: string, source_type: string, source_role: string[]) => ({
      key, name, type: "fixture", base_url: "https://fixture.example", feed_url: "https://fixture.example/feed", poll_interval_minutes: 1, source_type, source_role, adapter_status: "verified",
    });
    const { data, error } = await db().from("sources").insert([mk(keys.news, "Fixture News", "news", ["discovery"]), mk(keys.inv, "Fixture Capital", "investor", ["discovery", "enrichment"]), mk(keys.bad, "Fixture Broken Investor", "investor", ["discovery"])]).select("id");
    if (error) throw error;
    sourceIds.push(...data!.map((d) => d.id));
  });

  afterAll(async () => {
    const { data: arts } = await db().from("funding_articles").select("funding_round_id").in("source_id", sourceIds);
    const roundIds = [...new Set((arts ?? []).map((a) => a.funding_round_id).filter(Boolean))] as string[];
    const { data: rounds } = roundIds.length ? await db().from("funding_rounds").select("startup_id").in("id", roundIds) : { data: [] };
    const startupIds = [...new Set((rounds ?? []).map((r) => r.startup_id))];
    if (startupIds.length) await db().from("startups").delete().in("id", startupIds);
    await db().from("funding_articles").delete().in("source_id", sourceIds);
    await db().from("sources").delete().in("id", sourceIds);
    await db().from("investors").delete().ilike("name", "Fixture %");
    await db().from("pipeline_runs").delete().eq("trigger", "test");
  });

  it("merges investor + news reports into one startup and one funding round", async () => {
    const summary = await runPipeline(deps, { trigger: "test", force: true, sourceKeys: Object.values(keys) });
    // the broken investor source is one recorded error, and nothing else stopped
    expect(summary.errors.map((e) => e.scope)).toEqual([`source:${keys.bad}`]);
    expect(summary.articlesNew).toBe(2);
    expect(summary.fundingEvents).toBe(1);

    const { data: startups } = await db().from("startups").select("id,website,profile_json").ilike("name", "Fixture Orbit%");
    expect(startups).toHaveLength(1);
    const sid = startups![0].id;
    const { data: rounds } = await db().from("funding_rounds").select("id,status").eq("startup_id", sid);
    expect(rounds).toHaveLength(1);
    const { data: links } = await db().from("funding_round_sources").select("source_id").eq("funding_round_id", rounds![0].id);
    expect(links).toHaveLength(2);
    expect(new Set(links!.map((l) => l.source_id)).size).toBe(2);
  });

  it("attaches first-party evidence, fills missing facts without overwriting research, and flags the amount disagreement", async () => {
    const { data: s } = await db().from("startups").select("id,website").ilike("name", "Fixture Orbit%").single();
    // research had no website; the investor's first-party site supplied it
    expect(s!.website).toBe("https://fixture-orbit.example");

    const { data: founders } = await db().from("founders").select("name,role").eq("startup_id", s!.id);
    const byName = Object.fromEntries((founders ?? []).map((f) => [f.name, f.role]));
    expect(byName["Asha Rao"]).toBe("CEO"); // research's role kept (investor said "Chief Executive")
    expect(byName["Ravi Menon"]).toBe("CTO"); // missing founder added

    const { data: ev } = await db().from("research_evidence").select("field_key,evidence_type,confidence,conflict_json,source_url").eq("startup_id", s!.id);
    const fields = [...new Set((ev ?? []).map((e) => e.field_key))];
    expect(fields).toEqual(expect.arrayContaining(["portfolio_membership", "website", "founder", "co_investors", "investment_rationale", "funding_amount"]));
    expect((ev ?? []).filter((e) => e.field_key === "portfolio_membership").every((e) => e.evidence_type === "investor_first_party")).toBe(true);

    // $3.0M (news) vs $3.2M (investor): surfaced, not silently resolved
    const amounts = (ev ?? []).filter((e) => e.field_key === "funding_amount");
    expect(amounts).toHaveLength(2);
    expect(amounts.every((a) => a.conflict_json && a.confidence === "low")).toBe(true);
    expect(new Set(amounts.map((a) => a.evidence_type))).toEqual(new Set(["reputable_media", "investor_first_party"]));
  });

  it("records the investor relationship as confirmed by the investor's own site", async () => {
    const { data: s } = await db().from("startups").select("id").ilike("name", "Fixture Orbit%").single();
    const { data: r } = await db().from("funding_rounds").select("id").eq("startup_id", s!.id).single();
    const { data: inv } = await db().from("funding_round_investors").select("is_lead,confirmed_by_investor_site,evidence_url,investors(name)").eq("funding_round_id", r!.id);
    const mine = (inv ?? []).find((i: any) => i.investors?.name === "Fixture Capital") as any;
    expect(mine).toMatchObject({ confirmed_by_investor_site: true });
    expect(mine.evidence_url).toContain("investing-in-orbit");
  });

  it("leaves scoring and qualification exactly as the investor-free pipeline produces them", async () => {
    const { data: s } = await db().from("startups").select("id").ilike("name", "Fixture Orbit%").single();
    const { data: a } = await db().from("fit_assessments").select("total_score,qualified").eq("startup_id", s!.id);
    // same deterministic FakeAI scores as the existing fixture pipeline test (Fixture Nimbus): investor data adds nothing
    expect(a).toEqual([{ total_score: 87, qualified: true }]);
  });

  it("is idempotent: a second run adds no evidence rows and no duplicates", async () => {
    const { data: s } = await db().from("startups").select("id").ilike("name", "Fixture Orbit%").single();
    const before = await db().from("research_evidence").select("id", { count: "exact", head: true }).eq("startup_id", s!.id);
    await runPipeline(deps, { trigger: "test", force: true, sourceKeys: Object.values(keys) });
    const after = await db().from("research_evidence").select("id", { count: "exact", head: true }).eq("startup_id", s!.id);
    expect(after.count).toBe(before.count);
    const startups = await db().from("startups").select("id", { count: "exact", head: true }).ilike("name", "Fixture Orbit%");
    expect(startups.count).toBe(1);
  });
});
