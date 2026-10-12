import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { blume, candidateCommentaries, companyFromTitle, foundersFromLede, investmentKind, matchStartups, parseCommentary, parseStartupPage, pickCandidate, signalFromCommentary } from "@/lib/investors/sites/blume";
import type { SiteContext } from "@/lib/investors/types";

const fx = (n: string) => readFileSync(`tests/fixtures/investors/${n}`, "utf8");
const now = new Date("2026-10-12T12:00:00Z");

function fakeCtx(over: Partial<SiteContext> = {}, known: string[] = []) {
  const pages: Record<string, string> = {
    "https://blume.vc/sitemap.xml": fx("blume-sitemap-index.xml"),
    "https://blume.vc/sitemap-commentaries-1.xml": fx("blume-sitemap-commentaries.xml"),
    "https://blume.vc/sitemap-startups-1.xml": fx("blume-sitemap-startups.xml"),
    "https://blume.vc/sitemap-startups-2.xml": '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>https://blume.vc/other-two</loc></url></urlset>',
    "https://blume.vc/sitemap-startups-3.xml": '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>https://blume.vc/other-three</loc></url></urlset>',
    "https://blume.vc/commentaries/why-we-invested-in-lumio": fx("blume-commentary.html"),
    "https://blume.vc/lumio": fx("blume-startup.html"),
    "https://blume.vc/namma-yatri": fx("blume-startup-minimal.html"),
  };
  const fetched: string[] = [];
  const ctx: SiteContext = {
    now,
    windowDays: 30,
    maxPages: 6,
    isKnownUrl: (u) => known.includes(u),
    note: () => {},
    async fetch(url) {
      fetched.push(url);
      return pages[url] !== undefined ? { url, status: 200, text: pages[url] } : { url, status: 404, text: "" };
    },
    ...over,
  };
  return { ctx, fetched };
}

describe("Blume commentary parsing", () => {
  const page = parseCommentary(fx("blume-commentary.html"));

  it("reads headline, JSON-LD publish date and lede", () => {
    expect(page.headline).toBe("Why we invested in Lumio");
    expect(page.publishedAt?.toISOString()).toBe("2026-10-07T13:20:00.000Z");
    expect(page.lede).toContain("Series A");
  });

  it("builds a signal with stage, amount and founders taken from the post", () => {
    const s = signalFromCommentary("https://blume.vc/commentaries/why-we-invested-in-lumio", "why_we_invested", page, now, 30);
    expect(s).toMatchObject({ companyName: "Lumio", stage: "series-a", fundingAmount: 12_000_000, fundingCurrency: "USD", signalType: "why_we_invested", companyWebsite: null });
    expect(s?.founders).toEqual(["Raghu Reddy", "Kailash Sankaranarayan"]);
  });

  it("drops posts outside the window or without a date", () => {
    expect(signalFromCommentary("u", "why_we_invested", page, now, 3)).toBeNull();
    expect(signalFromCommentary("u", "why_we_invested", { ...page, publishedAt: null }, now, 30)).toBeNull();
  });

  it("never throws on unrelated markup", () => {
    expect(parseCommentary("<html><body>x</body></html>")).toMatchObject({ headline: null, publishedAt: null, lede: null });
  });

  it("classifies slugs and titles", () => {
    expect(investmentKind("why-we-invested-in-lumio")).toBe("why_we_invested");
    expect(investmentKind("wizcommerce-raises-a-8m-series-a-led-by-peak-xv-partners")).toBe("portfolio_funding_news");
    expect(investmentKind("we-closed-175-million-of-our-fund-v-target-of-250-275-million-for-the-final-close")).toBeNull();
    expect(investmentKind("how-to-evaluate-voice-ai-platforms")).toBeNull();
    expect(companyFromTitle("Why we invested in IDO Devices: building India's electronics ODM champion")).toBe("IDO Devices");
    expect(companyFromTitle("WizCommerce raises a $8M Series A led by Peak XV Partners")).toBe("WizCommerce");
    expect(companyFromTitle("How to evaluate voice AI platforms")).toBeNull();
    expect(foundersFromLede("We're backing the best team in India as they build things")).toEqual([]);
    expect(foundersFromLede("We’re backing Raghu Reddy and Kailash Sankaranarayan as they build")).toEqual(["Raghu Reddy", "Kailash Sankaranarayan"]);
  });
});

describe("Blume discover", () => {
  it("returns the recent investment post, opening only the index, one commentary sitemap and the post", async () => {
    const { ctx, fetched } = fakeCtx();
    const out = await blume.discover!(ctx);
    expect(out.map((s) => s.companyName)).toEqual(["Lumio"]);
    expect(fetched).toEqual(["https://blume.vc/sitemap.xml", "https://blume.vc/sitemap-commentaries-1.xml", "https://blume.vc/commentaries/why-we-invested-in-lumio"]);
  });

  it("skips known URLs without fetching them", async () => {
    const { ctx, fetched } = fakeCtx({}, ["https://blume.vc/commentaries/why-we-invested-in-lumio"]);
    expect(await blume.discover!(ctx)).toEqual([]);
    expect(fetched.some((u) => u.includes("/commentaries/why"))).toBe(false);
  });

  it("skips posts last modified before the window and non-investment posts", async () => {
    const { ctx, fetched } = fakeCtx({ windowDays: 2 });
    expect(await blume.discover!(ctx)).toEqual([]);
    expect(fetched).toHaveLength(2);
    const urls = candidateCommentaries([{ loc: "https://blume.vc/commentaries/how-procol-took-procurement-from-whatsapp-to-ai-agents", lastmod: now }], ctx);
    expect(urls).toEqual([]);
  });

  it("honours maxPages", async () => {
    const { ctx, fetched } = fakeCtx({ maxPages: 0 });
    expect(await blume.discover!(ctx)).toEqual([]);
    expect(fetched.some((u) => u.includes("/commentaries/why"))).toBe(false);
  });
});

describe("Blume portfolio page parsing", () => {
  it("extracts name, sector, location, website, year, founders and status", () => {
    const e = parseStartupPage(fx("blume-startup.html"), "https://blume.vc/lumio")!;
    expect(e).toMatchObject({
      companyName: "Lumio",
      website: "https://lumio.co.in/",
      sector: "Consumer Brands",
      location: "India, Bengaluru",
      partneredYear: 2026,
      status: "Active Funding",
      stage: null,
      rationale: [],
      coInvestors: [],
    });
    expect(e.description).toContain("smart TVs");
    expect(e.founders).toEqual([
      { name: "Raghu Reddy", role: null },
      { name: "Kailash Sankaranarayanan", role: null },
    ]);
  });

  it("joins several sectors and tolerates a page with no founders", () => {
    const e = parseStartupPage(fx("blume-startup-minimal.html"), "https://blume.vc/namma-yatri")!;
    expect(e.sector).toBe("Commerce & Consumer Brands / EV & Mobility");
    expect(e.founders).toEqual([]);
    expect(e.partneredYear).toBe(2024);
  });

  it("returns null instead of throwing on an unrelated page", () => {
    expect(parseStartupPage("<html><body><p>Just a moment...</p></body></html>", "https://blume.vc/x")).toBeNull();
  });
});

describe("Blume findEntry", () => {
  const entries = [
    "lumio",
    "confido-health",
    "ido",
    "bidso",
    "namma-yatri",
  ].map((s) => ({ loc: `https://blume.vc/${s}`, lastmod: null }));

  it("matches slugs to names with legal suffixes and prefix differences", () => {
    expect(matchStartups(entries, "Confido Health Pvt Ltd")[0]).toMatchObject({ slug: "confido-health", exact: true });
    expect(matchStartups(entries, "Namma Yatri Technologies")[0].slug).toBe("namma-yatri");
    expect(matchStartups(entries, "IDO Devices")[0]).toMatchObject({ slug: "ido", exact: false });
    expect(matchStartups(entries, "Totally Unknown Co")).toEqual([]);
    expect(pickCandidate([])).toBeNull();
  });

  it("fetches exactly one detail page for a hit", async () => {
    const { ctx, fetched } = fakeCtx();
    const e = await blume.findEntry!(ctx, { name: "Lumio Pvt Ltd", domain: "lumio.co.in" });
    expect(e?.companyName).toBe("Lumio");
    expect(fetched.filter((u) => !u.includes("sitemap"))).toEqual(["https://blume.vc/lumio"]);
  });

  it("does not fetch any detail page when no slug matches", async () => {
    const { ctx, fetched } = fakeCtx();
    expect(await blume.findEntry!(ctx, { name: "Zzyzx Imaginary Labs", domain: null })).toBeNull();
    expect(fetched.every((u) => u.includes("sitemap"))).toBe(true);
  });
});
