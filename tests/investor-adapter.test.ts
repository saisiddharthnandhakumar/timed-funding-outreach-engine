import { describe, expect, it } from "vitest";
import { InvestorDiscoveryAdapter, signalToArticle } from "@/lib/investors/adapter";
import { createSiteContext } from "@/lib/investors/fetch";
import { INVESTOR_SITES } from "@/lib/investors/registry";
import { emptySignal, type InvestorSite } from "@/lib/investors/types";
import { createAdapter } from "@/lib/sources/registry";
import { looksLikeFundingNews } from "@/lib/pipeline/prefilter";

const site = (over: Partial<InvestorSite> = {}): InvestorSite => ({ key: "t", name: "Test Capital", baseUrl: "https://t.example", roles: ["discovery"], ...over });
const ctx = () => createSiteContext({ fetcher: async (u) => ({ status: 200, text: "", contentType: "text/html", url: u }) as any });
const row = { id: "s1", key: "t" };

describe("investor signal → article", () => {
  const signal = emptySignal({ name: "Test Capital" }, {
    signalType: "why_we_invested", sourceUrl: "https://t.example/investing-in-acme", headline: "Why we invested in Acme", summary: "A short summary.",
    publishedAt: new Date("2026-10-12T00:00:00Z"), companyName: "Acme", stage: "seed", fundingAmount: 3_000_000, fundingCurrency: "USD", founders: ["A One"], coInvestors: ["Peer Fund"],
  });

  it("keeps the post's url, headline and date, and writes the known facts (and only those) into the text", () => {
    const a = signalToArticle(signal);
    expect(a).toMatchObject({ sourceUrl: signal.sourceUrl, headline: "Why we invested in Acme", publishedAt: signal.publishedAt });
    expect(a.contentText).toContain("Company: Acme");
    expect(a.contentText).toContain("Amount: 3000000 USD");
    expect(a.contentText).toContain("Co-investors: Peer Fund");
    expect(a.contentText).not.toContain("Website:"); // unknown values are omitted, never guessed
  });

  it("marks the snippet so a real 'investing in' post passes the unchanged news prefilter", () => {
    expect(looksLikeFundingNews("Why we invested in Acme", null)).toBe(false); // the headline alone is dropped
    const a = signalToArticle(signal);
    expect(looksLikeFundingNews(a.headline, a.snippet)).toBe(true);
  });
});

describe("InvestorDiscoveryAdapter", () => {
  it("returns signals as articles, dropping any without a usable url or headline", async () => {
    const s = site({ discover: async () => [emptySignal({ name: "T" }, { signalType: "investment_announcement", sourceUrl: "https://t.example/a", headline: "Investing in A" }), emptySignal({ name: "T" }, { signalType: "investment_announcement", sourceUrl: "not a url", headline: "Bad" })] });
    const out = await new InvestorDiscoveryAdapter(s, row, { context: async () => ctx() }).fetchLatest();
    expect(out.map((a) => a.headline)).toEqual(["Investing in A"]);
  });

  it("returns nothing (not an error) for a site with no discovery, and for a quiet week", async () => {
    expect(await new InvestorDiscoveryAdapter(site(), row, { context: async () => ctx() }).fetchLatest()).toEqual([]);
    expect(await new InvestorDiscoveryAdapter(site({ discover: async () => [] }), row, { context: async () => ctx() }).fetchLatest()).toEqual([]);
  });

  it("lets a site's failure propagate, so the pipeline records it against that one source", async () => {
    const s = site({ discover: async () => { throw new Error("layout changed"); } });
    await expect(new InvestorDiscoveryAdapter(s, row, { context: async () => ctx() }).fetchLatest()).rejects.toThrow("layout changed");
  });
});

describe("registry", () => {
  it("registers the verified investor sites under their source keys, and not the unsupported one", () => {
    expect(Object.keys(INVESTOR_SITES).sort()).toEqual(["blume_ventures", "elevation_capital", "india_quotient", "nexus_vp", "peak_xv", "stellaris_vp", "three_one_four"]);
    expect(INVESTOR_SITES.antler_india).toBeUndefined();
  });

  it("routes investor keys to the investor adapter and leaves every existing key on its original adapter", () => {
    const base = { id: "i", name: "n", type: "scrape", base_url: "https://x", feed_url: null, enabled: true, poll_interval_minutes: 60, last_polled_at: null, last_success_at: null, last_items_found: 0, last_error: null, last_error_at: null };
    expect(createAdapter({ ...base, key: "stellaris_vp" })).toBeInstanceOf(InvestorDiscoveryAdapter);
    expect(createAdapter({ ...base, key: "mint_startups" }).constructor.name).toBe("MintStartupsAdapter");
    expect(createAdapter({ ...base, key: "inc42_buzz", type: "rss", feed_url: "https://f" }).constructor.name).toBe("RssAdapter");
  });

  it("every registered site declares only roles it implements", () => {
    for (const s of Object.values(INVESTOR_SITES)) {
      if (s.roles.includes("discovery")) expect(s.discover, `${s.key} claims discovery`).toBeTypeOf("function");
      if (s.roles.includes("enrichment")) expect(s.findEntry, `${s.key} claims enrichment`).toBeTypeOf("function");
    }
  });
});
