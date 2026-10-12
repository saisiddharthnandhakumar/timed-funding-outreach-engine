import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  companyFromTitle,
  discover,
  findEntry,
  isInvestmentTitle,
  matchSlugs,
  parseBlogIndex,
  parseBlogPost,
  parsePortfolioPage,
  portfolioSlugs,
  signalFromPost,
  threeone4,
} from "@/lib/investors/sites/threeone4";
import type { SiteContext } from "@/lib/investors/types";

const fx = (n: string) => readFileSync(`tests/fixtures/investors/${n}`, "utf8");
const BASE = "https://www.3one4capital.com";

function fakeCtx(opts: { known?: string[]; windowDays?: number; maxPages?: number } = {}) {
  const fetched: string[] = [];
  const ctx: SiteContext = {
    now: new Date("2026-10-12T00:00:00Z"),
    windowDays: opts.windowDays ?? 60,
    maxPages: opts.maxPages ?? 10,
    isKnownUrl: (u) => (opts.known ?? []).includes(u),
    note: () => {},
    async fetch(url) {
      fetched.push(url);
      let text = "";
      if (url === `${BASE}/blog`) text = fx("threeone4-blog-index.html");
      else if (url.includes("/blogs/")) text = fx("threeone4-blog-post.html");
      else if (url === `${BASE}/sitemap.xml`) text = fx("threeone4-sitemap.xml");
      else if (url.endsWith("/portfolio-companies/dozee")) text = fx("threeone4-portfolio-dozee.html");
      else if (url.endsWith("/portfolio-companies/ripplr")) text = fx("threeone4-portfolio-ripplr.html");
      else return { url, status: 404, text: "" };
      return { url, status: 200, text };
    },
  };
  return { ctx, fetched };
}

describe("3one4 portfolio page parser", () => {
  const e = parsePortfolioPage(fx("threeone4-portfolio-dozee.html"), `${BASE}/portfolio-companies/dozee`);
  it("reads name, sector, website, founders, co-investors and description", () => {
    expect(e?.companyName).toBe("Dozee");
    expect(e?.sector).toBe("Digital Health");
    expect(e?.website).toBe("https://www.dozee.health/");
    expect(e?.founders.map((f) => f.name)).toEqual(["Mudit Dandwate", "Gaurav Parchani"]);
    expect(e?.coInvestors).toEqual(["YourNest", "Prime Venture Partners", "IndiGo", "IKP EDEN"]);
    expect(e?.description).toMatch(/^Dozee is the pioneer/);
    expect(e?.status).toBe("portfolio");
  });
  it("does not invent stage, year, location or rationale (the page publishes none)", () => {
    expect(e).toMatchObject({ stage: null, partneredYear: null, location: null, rationale: [] });
  });
  it("returns null for unrelated markup", () => {
    expect(parsePortfolioPage("<html><body><p>x</p></body></html>", "u")).toBeNull();
    expect(parsePortfolioPage("", "u")).toBeNull();
  });
});

describe("slug matching", () => {
  const slugs = portfolioSlugs([
    `${BASE}/team`,
    `${BASE}/portfolio-companies/dozee`,
    `${BASE}/portfolio-companies/eka-care`,
    `${BASE}/portfolio-companies/lumio-2`,
    `${BASE}/portfolio-companies/lumio`,
    `${BASE}/portfolio-companies/open`,
    `${BASE}/portfolio-companies/undisclosed-4`,
  ]);
  it("extracts only portfolio slugs", () => expect(slugs).toHaveLength(6));
  it("matches names with legal suffixes and punctuation", () => {
    expect(matchSlugs(slugs, "Dozee Technologies Pvt Ltd")[0]).toEqual({ slug: "dozee", needsDomain: false });
    expect(matchSlugs(slugs, "Eka.Care")[0]?.slug).toBe("eka-care");
  });
  it("only a domain-confirmed prefix match for longer names; never short or placeholder slugs", () => {
    expect(matchSlugs(slugs, "Eka Care Health Solutions")[0]).toEqual({ slug: "eka-care", needsDomain: true });
    expect(matchSlugs(slugs, "Open Secret Labs")).toEqual([]);
    expect(matchSlugs(slugs, "Undisclosed")).toEqual([]);
  });
  it("prefers the un-numbered variant", () => expect(matchSlugs(slugs, "Lumio")[0].slug).toBe("lumio"));
});

describe("3one4 findEntry", () => {
  it("fetches exactly one detail page for a match", async () => {
    const { ctx, fetched } = fakeCtx();
    const e = await findEntry(ctx, { name: "Dozee Technologies Pvt Ltd", domain: "dozee.health" });
    expect(e?.companyName).toBe("Dozee");
    expect(fetched.filter((u) => u.includes("/portfolio-companies/"))).toEqual([`${BASE}/portfolio-companies/dozee`]);
  });
  it("fetches no detail page when no slug matches", async () => {
    const { ctx, fetched } = fakeCtx();
    expect(await findEntry(ctx, { name: "Zork Quantum Labs", domain: "zork.io" })).toBeNull();
    expect(fetched).toEqual([`${BASE}/sitemap.xml`]);
  });
  it("rejects a same-name page whose website is a different domain", async () => {
    const { ctx } = fakeCtx();
    expect(await findEntry(ctx, { name: "Dozee", domain: "dozee.example" })).toBeNull();
  });
  it("does not fetch a partial-name candidate when it has no domain to confirm it", async () => {
    const { ctx, fetched } = fakeCtx();
    expect(await findEntry(ctx, { name: "Eka Care Health Solutions", domain: null })).toBeNull();
    expect(fetched.some((u) => u.includes("/portfolio-companies/"))).toBe(false);
  });
});

describe("3one4 blog parsing", () => {
  const cards = parseBlogIndex(fx("threeone4-blog-index.html"));
  it("reads cards with absolute urls, titles and dates", () => {
    expect(cards).toHaveLength(7);
    const g = cards.find((c) => /gravity/.test(c.url));
    expect(g?.title).toContain("Gravity Secures $15 Million");
    expect(g?.publishedAt?.toISOString()).toBe("2026-09-30T00:00:00.000Z");
  });
  it("accepts only funding announcements, not thought leadership, exits or fund news", () => {
    const ok = cards.filter((c) => isInvestmentTitle(c.title)).map((c) => c.title);
    expect(ok.some((t) => /Gravity/.test(t))).toBe(true);
    expect(ok.some((t) => /Cradlewise/.test(t))).toBe(true);
    expect(ok.some((t) => /Smallest\.ai/.test(t))).toBe(true);
    expect(ok.some((t) => /Long Shadow/.test(t))).toBe(false);
    expect(ok.some((t) => /Profitable Exit/.test(t))).toBe(false);
    expect(ok.some((t) => /Fund III/.test(t))).toBe(false);
  });
  it("extracts company names only when clear", () => {
    expect(companyFromTitle("Building the Material Backbone for Modern Interiors: Gravity Secures $15 Million")).toBe("Gravity");
    expect(companyFromTitle("Re-engineering the Modern Nursery. Cradlewise Raises $12 Million to Scale the Smart Infant Sleep System.")).toBe("Cradlewise");
    expect(companyFromTitle("Smallest.ai Raises $13M Series A to Break the Turing Test")).toBe("Smallest.ai");
    expect(companyFromTitle("3one4 Capital Backs Zerocircle: Innovative Bio-Materials From Regenerative Resources")).toBe("Zerocircle");
    expect(companyFromTitle("India Raises Its Game on Funding Deep Tech")).toBeNull();
  });
  it("parses a post and builds a signal with deterministic fields only", () => {
    const post = parseBlogPost(fx("threeone4-blog-post.html"));
    expect(post?.mentions3one4).toBe(true);
    expect(post?.publishedAt?.toISOString()).toBe("2026-09-30T00:00:00.000Z");
    const card = cards.find((c) => /gravity/.test(c.url))!;
    const s = signalFromPost(card, post!);
    expect(s).toMatchObject({ companyName: "Gravity", fundingAmount: 15_000_000, fundingCurrency: "USD", stage: null, founders: [], coInvestors: [], signalType: "portfolio_funding_news" });
  });
  it("returns null for a page without a post body", () => expect(parseBlogPost("<html></html>")).toBeNull());
});

describe("3one4 discover", () => {
  it("returns recent investment posts only, fetching just those detail pages", async () => {
    const { ctx, fetched } = fakeCtx({ windowDays: 60 });
    const sigs = await discover(ctx);
    expect(sigs.map((s) => s.companyName).sort()).toEqual(["Cradlewise", "Gravity", "Yulu"]);
    expect(fetched.filter((u) => u.includes("/blogs/"))).toHaveLength(3);
    expect(fetched.some((u) => /exit|long-shadow|fund-iii/.test(u))).toBe(false);
  });
  it("skips out-of-window posts", async () => {
    const { ctx } = fakeCtx({ windowDays: 20 });
    expect((await discover(ctx)).map((s) => s.companyName)).toEqual(["Gravity"]);
  });
  it("skips known urls without fetching them", async () => {
    const known = parseBlogIndex(fx("threeone4-blog-index.html")).find((c) => /gravity/.test(c.url))!.url;
    const { ctx, fetched } = fakeCtx({ windowDays: 20, known: [known] });
    expect(await discover(ctx)).toEqual([]);
    expect(fetched).toEqual([`${BASE}/blog`]);
  });
  it("respects maxPages", async () => {
    const { ctx, fetched } = fakeCtx({ windowDays: 60, maxPages: 1 });
    expect(await discover(ctx)).toHaveLength(1);
    expect(fetched.filter((u) => u.includes("/blogs/"))).toHaveLength(1);
  });
  it("exposes the site descriptor", () => {
    expect(threeone4).toMatchObject({ key: "three_one_four", name: "3one4 Capital", baseUrl: BASE });
    expect(threeone4.roles).toEqual(["discovery", "enrichment", "verification"]);
  });
});
