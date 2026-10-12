import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createSiteContext } from "@/lib/investors/fetch";
import {
  companyFromFundingHeadline,
  companyFromInvestmentTitle,
  matchSlugs,
  parseCardDate,
  parseInsightsIndex,
  parsePortfolioEntry,
  portfolioSlugs,
  signalFromCard,
  stellaris,
} from "@/lib/investors/sites/stellaris";

const fx = (n: string) => readFileSync(new URL(`../fixtures/investors/${n}`, import.meta.url), "utf8");
const insights = fx("stellaris-insights.html");
const sitemap = fx("stellaris-sitemap.xml");
const NOW = new Date("2026-08-10T00:00:00Z");

function fakeCtx(opts: { windowDays?: number; known?: string[]; pages?: Record<string, string> } = {}) {
  const calls: string[] = [];
  const pages: Record<string, string> = {
    "https://www.stellarisvp.com/insights": insights,
    "https://www.stellarisvp.com/sitemap.xml": sitemap,
    "https://www.stellarisvp.com/portfolio/arrowhead": fx("stellaris-portfolio-arrowhead.html"),
    "https://www.stellarisvp.com/portfolio/pibit-ai": fx("stellaris-portfolio-pibit-ai.html"),
    ...opts.pages,
  };
  const known = new Set(opts.known ?? []);
  const ctx = {
    now: NOW,
    windowDays: opts.windowDays ?? 30,
    maxPages: 6,
    isKnownUrl: (u: string) => known.has(u),
    note: () => undefined,
    fetch: async (url: string) => {
      calls.push(url);
      const text = pages[url];
      return { url, status: text === undefined ? 404 : 200, text: text ?? "" };
    },
  };
  return { ctx, calls };
}

describe("parseCardDate", () => {
  it("parses a long date and rejects junk", () => {
    expect(parseCardDate("July 23, 2026")?.toISOString()).toBe("2026-07-23T12:00:00.000Z");
    expect(parseCardDate("Smarch 3, 2026")).toBeNull();
    expect(parseCardDate("")).toBeNull();
    expect(parseCardDate(null)).toBeNull();
  });
});

describe("parseInsightsIndex", () => {
  const cards = parseInsightsIndex(insights);
  it("reads kind, title, date, sector and the press link for news", () => {
    const carpl = cards.find((c) => c.title.startsWith("CARPL.ai raises"));
    expect(carpl).toMatchObject({ kind: "news", sector: "Healthcare", category: "News" });
    expect(carpl?.url).toMatch(/^https:\/\/www\.business-standard\.com\//);
    expect(carpl?.date?.toISOString().slice(0, 10)).toBe("2026-07-23");
  });
  it("reads blog cards with site-relative links made absolute", () => {
    const b = cards.find((c) => c.url === "https://www.stellarisvp.com/blog/the-agentic-analyst-why-we-invested-in-pinegap");
    expect(b).toMatchObject({ kind: "blog", category: "Why we invested" });
  });
  it("keeps an undated card undated and never throws on garbage", () => {
    expect(cards.find((c) => c.title.startsWith("Zeta raises"))?.date).toBeNull();
    expect(parseInsightsIndex("<html><body>nope</body></html>")).toEqual([]);
    expect(parseInsightsIndex("")).toEqual([]);
  });
});

describe("company extraction", () => {
  it("takes the name after a descriptor or a lone first token", () => {
    expect(companyFromFundingHeadline("Voice AI firm Arrowhead raises $3 million in a round led by Stellaris Venture Partners")).toBe("Arrowhead");
    expect(companyFromFundingHeadline("CARPL.ai raises $10M Series A led by IFC & Stellaris")).toBe("CARPL.ai");
    expect(companyFromFundingHeadline("Accounting tech startup Atlas raises $6 million")).toBe("Atlas");
    expect(companyFromFundingHeadline("Techfino raises Rs 65 cr from Stellaris, Saison Capital")).toBe("Techfino");
  });
  it("returns null when ambiguous", () => {
    expect(companyFromFundingHeadline("Seven bets in a year of fifty: Inside Stellaris Venture Partners")).toBeNull();
    expect(companyFromFundingHeadline("Some ambiguous multi word prefix raises $5M")).toBeNull();
    expect(companyFromFundingHeadline("Acme and Beta raise $5M")).toBeNull();
  });
  it("pulls the company out of investment-post titles", () => {
    expect(companyFromInvestmentTitle("The Agentic Analyst: Why We Invested in Pinegap")).toBe("Pinegap");
    expect(companyFromInvestmentTitle("The Future of Micro-Drama in India: Our Investment in Flick TV")).toBe("Flick TV");
    expect(companyFromInvestmentTitle("Why we invested in what makes a great, very long sentence of words")).toBeNull();
  });
});

describe("signalFromCard", () => {
  const sig = (prefix: string) => {
    const c = parseInsightsIndex(insights).find((x) => x.title.startsWith(prefix));
    return c ? signalFromCard(c) : undefined;
  };
  it("builds a funding signal with amount, stage and date", () => {
    expect(sig("CARPL.ai raises")).toMatchObject({
      signalType: "portfolio_funding_news",
      companyName: "CARPL.ai",
      fundingAmount: 10_000_000,
      fundingCurrency: "USD",
      stage: "series-a",
      sector: "Healthcare",
      sourceName: "Stellaris Venture Partners",
    });
    expect(sig("Techfino raises")).toMatchObject({ fundingAmount: 650_000_000, fundingCurrency: "INR" });
  });
  it("leaves unknowns null rather than guessing", () => {
    expect(sig("Kim.cc Raises")).toMatchObject({ companyName: "Kim.cc", fundingAmount: null, stage: null, founders: [], coInvestors: [], companyWebsite: null });
  });
  it("skips non-investment posts", () => {
    expect(sig("Seven bets")).toBeNull();
    expect(sig("Stellaris Venture Partners to deploy")).toBeNull();
    expect(sig("The Case for MSP")).toBeNull();
    expect(sig("ATLAS: Powering")).toBeNull();
  });
  it("turns why-we-invested blogs into signals", () => {
    expect(sig("The Agentic Analyst")).toMatchObject({ signalType: "why_we_invested", companyName: "Pinegap" });
    expect(sig("The Future of Micro-Drama")).toMatchObject({ signalType: "investment_announcement", companyName: "Flick TV" });
  });
});

describe("discover", () => {
  it("returns only in-window, dated investment posts using a single request", async () => {
    const { ctx, calls } = fakeCtx({ windowDays: 400 });
    const out = await stellaris.discover!(ctx);
    expect(calls).toEqual(["https://www.stellarisvp.com/insights"]);
    const heads = out.map((s) => s.headline);
    expect(heads.some((h) => h.startsWith("CARPL.ai raises"))).toBe(true);
    expect(heads.some((h) => h.startsWith("Techfino raises"))).toBe(false); // 2025-06, beyond 400 days of 2026-08
    expect(heads.some((h) => h.startsWith("Zeta raises"))).toBe(false); // undated
    expect(heads.some((h) => h.startsWith("Seven bets"))).toBe(false);
    expect(out.every((s) => s.publishedAt)).toBe(true);
  });
  it("drops posts older than the window", async () => {
    const { ctx } = fakeCtx({ windowDays: 2 });
    expect(await stellaris.discover!(ctx)).toEqual([]);
  });
  it("skips known urls", async () => {
    const press = parseInsightsIndex(insights).find((c) => c.title.startsWith("CARPL.ai raises"))!.url;
    const { ctx } = fakeCtx({ windowDays: 400, known: [press] });
    const out = await stellaris.discover!(ctx);
    expect(out.some((s) => s.sourceUrl === press)).toBe(false);
    expect(out.length).toBeGreaterThan(0);
  });
  it("returns nothing when the index is unavailable", async () => {
    const { ctx } = fakeCtx({ pages: { "https://www.stellarisvp.com/insights": "" } });
    ctx.fetch = async (url: string) => ({ url, status: 503, text: "" });
    expect(await stellaris.discover!(ctx)).toEqual([]);
  });
});

describe("portfolio parsing", () => {
  it("parses a page with a co-investor list", () => {
    const e = parsePortfolioEntry(fx("stellaris-portfolio-pibit-ai.html"), "https://www.stellarisvp.com/portfolio/pibit-ai");
    expect(e).toMatchObject({
      companyName: "Pibit.AI",
      website: "https://www.pibit.ai/",
      sector: "AI",
      stage: "series-a",
      partneredYear: 2025,
      status: "active",
      description: "modernizing underwriting workflows with AI",
      coInvestors: ["Y Combinator", "Arali Ventures"],
      founders: [{ name: "Akash Agarwal", role: null }],
      rationale: [],
    });
  });
  it("parses a seed page with several founders and no co-investors", () => {
    const e = parsePortfolioEntry(fx("stellaris-portfolio-arrowhead.html"), "https://www.stellarisvp.com/portfolio/arrowhead");
    expect(e).toMatchObject({ companyName: "Arrowhead", stage: "seed", partneredYear: 2025, coInvestors: [] });
    expect(e?.founders.map((f) => f.name)).toEqual(["Devyani Gupta", "Vengadanathan Srinivasan"]);
  });
  it("never publishes the free-text why-we-invested blurb", () => {
    const e = parsePortfolioEntry(fx("stellaris-portfolio-carpl.html"), "https://www.stellarisvp.com/portfolio/carpl");
    expect(e?.companyName).toMatch(/carpl/i);
    expect(e?.rationale).toEqual([]);
  });
  it("returns null on a changed layout", () => {
    expect(parsePortfolioEntry("<html><body><p>hi</p></body></html>", "https://x")).toBeNull();
    expect(parsePortfolioEntry("", "https://x")).toBeNull();
  });
});

describe("slug matching", () => {
  const slugs = portfolioSlugs([
    "https://www.stellarisvp.com/portfolio/pibit-ai",
    "https://www.stellarisvp.com/portfolio/loadshare-networks",
    "https://www.stellarisvp.com/portfolio/flick-tv",
    "https://www.stellarisvp.com/blog/something",
    "https://www.stellarisvp.com/portfolio",
  ]);
  it("only takes /portfolio/<slug> urls", () => expect(slugs).toHaveLength(3));
  it("matches despite suffix noise", () => {
    expect(matchSlugs(slugs, "Pibit.AI Technologies Pvt Ltd").map((s) => s.slug)).toEqual(["pibit-ai"]);
    expect(matchSlugs(slugs, "Loadshare Networks Pvt. Ltd.").map((s) => s.slug)).toEqual(["loadshare-networks"]);
    expect(matchSlugs(slugs, "FlickTV").map((s) => s.slug)).toEqual(["flick-tv"]);
    expect(matchSlugs(slugs, "Nimbus")).toEqual([]);
  });
});

describe("findEntry", () => {
  it("fetches one detail page for a match", async () => {
    const { ctx, calls } = fakeCtx();
    const e = await stellaris.findEntry!(ctx, { name: "Pibit.AI Technologies Pvt Ltd", domain: "pibit.ai" });
    expect(e?.companyName).toBe("Pibit.AI");
    expect(calls).toEqual(["https://www.stellarisvp.com/sitemap.xml", "https://www.stellarisvp.com/portfolio/pibit-ai"]);
  });
  it("does not fetch any detail page when no slug matches", async () => {
    const { ctx, calls } = fakeCtx();
    expect(await stellaris.findEntry!(ctx, { name: "Totally Made Up Co", domain: null })).toBeNull();
    expect(calls).toEqual(["https://www.stellarisvp.com/sitemap.xml"]);
  });
  it("rejects a name match whose website is a different domain", async () => {
    const { ctx } = fakeCtx();
    expect(await stellaris.findEntry!(ctx, { name: "Arrowhead", domain: "arrowhead-steel.com" })).toBeNull();
  });
  it("createSiteContext is compatible with the site shape", () => {
    expect(typeof createSiteContext).toBe("function");
    expect(stellaris.key).toBe("stellaris_vp");
  });
});
