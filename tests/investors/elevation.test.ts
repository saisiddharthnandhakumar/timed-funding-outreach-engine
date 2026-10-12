import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it } from "vitest";
import {
  companySlugCandidates,
  elevation,
  parseElevationCompany,
  parseElevationPost,
  postSlugsFromSitemap,
  resetElevationStaleMemo,
} from "@/lib/investors/sites/elevation";
import type { SiteContext } from "@/lib/investors/types";

const fx = (n: string) => readFileSync(`tests/fixtures/investors/${n}`, "utf8");
const sitemap = fx("elevation-sitemap.xml");
const urls = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);

function fakeCtx(pages: Record<string, string>, over: Partial<SiteContext> = {}) {
  const fetched: string[] = [];
  const ctx: SiteContext = {
    now: new Date("2025-05-25T00:00:00Z"),
    windowDays: 30,
    maxPages: 6,
    isKnownUrl: () => false,
    note: () => {},
    async fetch(url) {
      fetched.push(url);
      const text = pages[url];
      return { url, status: text === undefined ? 404 : 200, text: text ?? "" };
    },
    ...over,
  };
  return { ctx, fetched };
}

describe("Elevation parsers", () => {
  it("parses an investing-in post", () => {
    const p = parseElevationPost(fx("elevation-post-adopt-ai.html"));
    expect(p?.companyName).toBe("Adopt AI");
    expect(p?.publishedAt?.toISOString().slice(0, 10)).toBe("2025-05-19");
    expect(p?.sector).toBe("Enterprise AI");
    expect(p?.isPortfolioPost).toBe(true);
  });

  it("does not treat a company page or listing as a post, and vice versa", () => {
    expect(parseElevationPost(fx("elevation-company-everstage.html"))).toBeNull();
    expect(parseElevationCompany(fx("elevation-post-adopt-ai.html"))).toBeNull();
    expect(parseElevationPost(fx("elevation-listing-portfolio-blog.html"))).toBeNull();
  });

  it("parses a company page", () => {
    const c = parseElevationCompany(fx("elevation-company-everstage.html"));
    expect(c).toMatchObject({ title: "Everstage", stage: "series-a", sector: "Enterprise AI", founders: ["Siva Rajamani", "Vivek Suriyamoorthy"] });
    expect(c?.website).toContain("everstage.com");
    expect(c?.description).toBe("Managing sales commissions on autopilot");
  });

  it("never throws on garbage", () => {
    expect(parseElevationPost("<html></html>")).toBeNull();
    expect(parseElevationCompany('<script id="__NEXT_DATA__">{bad</script>')).toBeNull();
  });

  it("selects post slugs and company candidates from the flat sitemap", () => {
    const posts = postSlugsFromSitemap(urls);
    expect(posts).toContain("investing-in-adopt-ai");
    expect(posts.every((s) => s.startsWith("investing-in-"))).toBe(true);
    expect(new Set(posts).size).toBe(posts.length);
    expect(companySlugCandidates(urls, "Detect Technologies Pvt Ltd")).toEqual(["detect-technologies"]);
    expect(companySlugCandidates(urls, "The Souled Store")).toEqual(["souledstore"]);
    expect(companySlugCandidates(urls, "Nonexistent Robotics")).toEqual([]);
  });
});

describe("Elevation site", () => {
  beforeEach(() => resetElevationStaleMemo());
  const base = { "https://elevationcapital.com/sitemap.xml": sitemap };

  it("discover returns only in-window portfolio posts and skips known/old/non-posts", async () => {
    const { ctx, fetched } = fakeCtx(
      {
        ...base,
        "https://elevationcapital.com/investing-in-adopt-ai": fx("elevation-post-adopt-ai.html"),
        "https://elevationcapital.com/investing-in-vegapay": fx("elevation-post-vegapay.html"),
        "https://elevationcapital.com/investing-in-india": fx("elevation-listing-portfolio-blog.html"),
      },
      { isKnownUrl: (u) => u.endsWith("investing-in-atlys") },
    );
    const sigs = await elevation.discover!(ctx);
    expect(sigs.map((s) => s.companyName)).toEqual(["Adopt AI"]);
    expect(sigs[0]).toMatchObject({ signalType: "investment_announcement", sourceUrl: "https://elevationcapital.com/investing-in-adopt-ai", stage: null, fundingAmount: null });
    expect(fetched).not.toContain("https://elevationcapital.com/investing-in-atlys");
  });

  it("discover respects maxPages", async () => {
    const { ctx, fetched } = fakeCtx({ ...base }, { maxPages: 2 });
    await elevation.discover!(ctx);
    expect(fetched.filter((u) => u.includes("investing-in-")).length).toBe(2);
  });

  it("findEntry parses one company page", async () => {
    const { ctx, fetched } = fakeCtx({ ...base, "https://elevationcapital.com/detect-technologies": fx("elevation-company-detect-technologies.html") });
    const e = await elevation.findEntry!(ctx, { name: "Detect Technologies Pvt Ltd", domain: "detecttechnologies.com" });
    expect(e).toMatchObject({ companyName: "Detect Technologies", stage: "series-a", sector: "Frontier Tech" });
    expect(e?.founders.length).toBeGreaterThan(0);
    expect(fetched.filter((u) => !u.endsWith("sitemap.xml"))).toHaveLength(1);
  });

  it("findEntry rejects a name match whose website domain differs", async () => {
    const { ctx } = fakeCtx({ ...base, "https://elevationcapital.com/detect-technologies": fx("elevation-company-detect-technologies.html") });
    expect(await elevation.findEntry!(ctx, { name: "Detect", domain: "other.com" })).toBeNull();
  });

  it("findEntry does not fetch any detail page when no slug matches", async () => {
    const { ctx, fetched } = fakeCtx({ ...base });
    expect(await elevation.findEntry!(ctx, { name: "Totally Made Up Labs", domain: null })).toBeNull();
    expect(fetched).toEqual(["https://elevationcapital.com/sitemap.xml"]);
  });
});
