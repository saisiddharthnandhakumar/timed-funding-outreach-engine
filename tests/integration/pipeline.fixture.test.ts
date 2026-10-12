import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/supabase/admin";
import { hasSupabaseEnv } from "@/lib/env";
import { runPipeline } from "@/lib/pipeline/run";
import { DatabaseDraftProvider } from "@/lib/outreach/providers";
import { FakeAI, FixtureAdapter, cls } from "./fakes";

/**
 * FIXTURE-BASED integration test against the real Supabase schema.
 * Everything here is synthetic (clearly named "Fixture …", source keys prefixed
 * test_fixture_) and is deleted afterwards. It is NOT live data.
 */
const suite = hasSupabaseEnv() ? describe : describe.skip;

suite("fixture pipeline (real DB, fake AI, fixture sources)", () => {
  const tag = `test_fixture_${Date.now()}`;
  const keys = [`${tag}_a`, `${tag}_b`];
  const hoursAgo = (h: number) => new Date(Date.now() - h * 3_600_000);
  const H = {
    et: "Fixture Nimbus raises $2.5M seed round led by Fixture Ventures",
    inc42: "Fixture Nimbus AI bags $2.5 Mn in seed funding",
    us: "Fixture USCo raises $3M seed round",
    seriesB: "Fixture BigCo raises $40M Series B",
  };
  const adapters: Record<string, FixtureAdapter> = {
    [keys[0]]: new FixtureAdapter(keys[0], [
      { sourceUrl: `https://fixture.example/${tag}/et-nimbus`, headline: H.et, snippet: "Seed round for AI procurement", contentText: "x".repeat(700), publishedAt: hoursAgo(3) },
      { sourceUrl: `https://fixture.example/${tag}/us`, headline: H.us, snippet: "US startup seed", contentText: "x".repeat(700), publishedAt: hoursAgo(2) },
      { sourceUrl: `https://fixture.example/${tag}/b`, headline: H.seriesB, snippet: "Series B raise", contentText: "x".repeat(700), publishedAt: hoursAgo(2) },
    ]),
    [keys[1]]: new FixtureAdapter(keys[1], [
      { sourceUrl: `https://fixture.example/${tag}/inc42-nimbus`, headline: H.inc42, snippet: "Seed round", contentText: "x".repeat(700), publishedAt: hoursAgo(1) },
    ]),
  };
  const ai = new FakeAI({
    [H.et]: { classification: cls({}) },
    [H.inc42]: { classification: cls({ company_name: "Fixture Nimbus AI Pvt. Ltd." }) },
    [H.us]: { classification: cls({ company_name: "Fixture USCo", hq_country: "United States", is_indian_startup: false, hq_city: "Austin" }) },
    [H.seriesB]: { classification: cls({ company_name: "Fixture BigCo", funding_stage: "series-b", funding_amount: 40_000_000 }) },
  });
  const deps = {
    ai,
    createAdapter: (row: { key: string }) => adapters[row.key],
    fetchArticleText: async () => ({ text: "x".repeat(700), links: [] }),
    draftProvider: new DatabaseDraftProvider(),
    enrichContacts: async () => null, // contact discovery is covered by tests/contacts/*; no network here
  };
  const sourceIds: string[] = [];

  beforeAll(async () => {
    const { data, error } = await db()
      .from("sources")
      .insert(keys.map((k) => ({ key: k, name: `Fixture ${k}`, type: "fixture", base_url: "https://fixture.example", feed_url: "https://fixture.example/feed", poll_interval_minutes: 1 })))
      .select("id");
    if (error) throw error;
    sourceIds.push(...data!.map((d) => d.id));
  });

  afterAll(async () => {
    const { data: arts } = await db().from("funding_articles").select("funding_round_id").in("source_id", sourceIds);
    const roundIds = [...new Set((arts ?? []).map((a) => a.funding_round_id).filter(Boolean))] as string[];
    const { data: rounds } = roundIds.length ? await db().from("funding_rounds").select("startup_id").in("id", roundIds) : { data: [] };
    const startupIds = [...new Set((rounds ?? []).map((r) => r.startup_id))];
    if (startupIds.length) await db().from("startups").delete().in("id", startupIds); // cascades rounds, assessments, outreach, round sources
    await db().from("funding_articles").delete().in("source_id", sourceIds);
    await db().from("sources").delete().in("id", sourceIds);
    await db().from("investors").delete().ilike("name", "Fixture %");
    await db().from("pipeline_runs").delete().eq("trigger", "test");
  });

  it("runs the full funnel: classify → filter → dedupe → research → score → draft", async () => {
    const summary = await runPipeline(deps, { trigger: "test", force: true, sourceKeys: keys });
    expect(summary.errors).toEqual([]);
    expect(summary.articlesNew).toBe(4);
    expect(summary.fundingEvents).toBe(1); // ET + Inc42 reports → ONE funding event
    expect(summary.qualified).toBe(1);
    expect(summary.drafts).toBe(1);

    const { data: startups } = await db().from("startups").select("id,name,normalized_name").ilike("name", "Fixture Nimbus%");
    expect(startups).toHaveLength(1);
    const startupId = startups![0].id;

    const { data: rounds } = await db().from("funding_rounds").select("id,status,stage").eq("startup_id", startupId);
    expect(rounds).toHaveLength(1);
    expect(rounds![0]).toMatchObject({ stage: "seed", status: "drafted" });

    const { data: links } = await db().from("funding_round_sources").select("source_id,source_published_at,first_seen_at").eq("funding_round_id", rounds![0].id);
    expect(links).toHaveLength(2); // timing preserved per source
    expect(links!.every((l) => l.source_published_at && l.first_seen_at)).toBe(true);

    const { data: assess } = await db().from("fit_assessments").select("*").eq("funding_round_id", rounds![0].id);
    expect(assess).toHaveLength(1);
    expect(assess![0]).toMatchObject({ qualified: true, total_score: 87 });
    expect(assess![0].thesis_version).toBeGreaterThanOrEqual(1);
    expect(assess![0].scoring_snapshot.criteria.length).toBe(8);

    const { data: out } = await db().from("outreach").select("status,draft_provider,subject").eq("startup_id", startupId);
    expect(out).toHaveLength(1);
    expect(out![0]).toMatchObject({ status: "generated", draft_provider: "database" });

    // Hard-filter rejections carry reasons.
    const { data: rej } = await db().from("funding_articles").select("headline,processing_status,rejection_reason").in("source_id", sourceIds).eq("processing_status", "rejected");
    const reasons = Object.fromEntries((rej ?? []).map((r) => [r.headline, r.rejection_reason]));
    expect(reasons[H.us]).toBe("wrong_geography");
    expect(reasons[H.seriesB]).toBe("wrong_stage");
  });

  it("is idempotent: re-running creates no duplicates and never a second outreach", async () => {
    const before = await db().from("funding_articles").select("id", { count: "exact", head: true }).in("source_id", sourceIds);
    const calls = ai.calls.length;
    const summary = await runPipeline(deps, { trigger: "test", force: true, sourceKeys: keys });
    expect(summary.articlesNew).toBe(0);
    expect(summary.drafts).toBe(0);
    expect(ai.calls.length).toBe(calls); // no repeat AI work on unchanged input
    const after = await db().from("funding_articles").select("id", { count: "exact", head: true }).in("source_id", sourceIds);
    expect(after.count).toBe(before.count);
  });

  it("database refuses a second live outreach for the same startup", async () => {
    const { data: s } = await db().from("startups").select("id").ilike("name", "Fixture Nimbus%").single();
    const { data: r } = await db().from("funding_rounds").select("id").eq("startup_id", s!.id).single();
    const dup = await db().from("outreach").insert({ startup_id: s!.id, funding_round_id: r!.id, subject: "dup", body: "dup dup dup dup dup dup dup", status: "generated" });
    expect(dup.error?.code).toBe("23505");
  });
});
