import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  companyRefsFromUrls,
  domainLabel,
  matchSlugs,
  pageMatches,
  parseCompanyPage,
  parseInsightsIndex,
  parseLongDate,
  parsePostPage,
  peakxv,
  signalFromPost,
} from "@/lib/investors/sites/peakxv";
import type { FetchedPage, SiteContext } from "@/lib/investors/types";

const fx = (n: string) => readFileSync(`tests/fixtures/investors/${n}`, "utf8");
const sitemap = fx("peakxv-sitemap.xml");
const indexHtml = fx("peakxv-insights-index.html");
const pages: Record<string, string> = {
  "https://www.peakxv.com/sitemap.xml": sitemap,
  "https://www.peakxv.com/insights": indexHtml,
  "https://www.peakxv.com/companies/aampe": fx("peakxv-company-aampe.html"),
  "https://www.peakxv.com/companies/1mg": fx("peakxv-company-1mg.html"),
  "https://www.peakxv.com/insight/blacksmith-a-foundational-compute-platform-for-the-autonomous-coding-era": fx("peakxv-insight-blacksmith.html"),
  "https://www.peakxv.com/insight/investing-in-luminai-transforming-operations-for-a-5t-industry": fx("peakxv-insight-luminai.html"),
  "https://www.peakxv.com/insight/pods-not-pyramids-how-meesho-built-ownership-into-its-operating-system": fx("peakxv-insight-ipo.html"),
};

function fakeCtx(over: Partial<SiteContext> = {}) {
  const fetched: string[] = [];
  const ctx: SiteContext = {
    now: new Date("2026-08-20T00:00:00Z"),
    windowDays: 30,
    maxPages: 6,
    isKnownUrl: () => false,
    note: () => undefined,
    async fetch(url): Promise<FetchedPage> {
      fetched.push(url);
      const text = pages[url];
      return { url, status: text === undefined ? 404 : 200, text: text ?? "" };
    },
    ...over,
  };
  return { ctx, fetched };
}
const details = (f: string[]) => f.filter((u) => /\/(companies|insight|announcement)\//.test(u));

describe("Peak XV company page", () => {
  const aampe = parseCompanyPage(fx("peakxv-company-aampe.html"), "https://www.peakxv.com/companies/aampe")!;
  it("extracts the portfolio facts", () => {
    expect(aampe.companyName).toBe("Aampe");
    expect(aampe.website).toBe("https://www.aampe.com/");
    expect(aampe.sector).toBe("AI");
    expect(aampe.partneredYear).toBe(2020);
    expect(aampe.stage).toBe("seed");
    expect(aampe.location).toBe("India");
    expect(aampe.description).toContain("retention growth engine");
    expect(aampe.founders.map((f) => f.name)).toContain("Paul Meinshausen");
    expect(aampe.rationale).toEqual([]);
  });
  it("leaves non-pipeline stages null but keeps the raw status", () => {
    const m = parseCompanyPage(fx("peakxv-company-1mg.html"), "https://www.peakxv.com/companies/1mg")!;
    expect(m.stage).toBeNull();
    expect(m.status).toBe("Growth");
    expect(m.partneredYear).toBe(2016);
    expect(m.sector).toBe("Consumer");
  });
  it("returns null for an unrelated page", () => {
    expect(parseCompanyPage("<html><body><h1>hi</h1></body></html>", "x")).toBeNull();
  });
  it("pageMatches checks name and domain conflicts", () => {
    expect(pageMatches(aampe, { name: "Aampe Inc", domain: null })).toBe(true);
    expect(pageMatches(aampe, { name: "Other", domain: "aampe.com" })).toBe(true);
    expect(pageMatches(aampe, { name: "Aampe", domain: "aampe-other.io" })).toBe(false);
    expect(pageMatches(aampe, { name: "Different", domain: null })).toBe(false);
  });
});

describe("Peak XV slug matching", () => {
  const refs = companyRefsFromUrls([...sitemap.matchAll(/<loc>([^<]*)<\/loc>/g)].map((m) => m[1]));
  it("keeps only /companies/<slug> urls", () => {
    expect(refs.map((r) => r.slug)).toContain("aampe");
    expect(refs.some((r) => r.slug === "our-team")).toBe(false);
  });
  it("resolves names that differ from the slug", () => {
    expect(matchSlugs(refs, { name: "Aampe Technologies Pvt Ltd", domain: null })[0]?.slug).toBe("aampe");
    expect(matchSlugs(refs, { name: "Sarvam", domain: null })[0]?.slug).toBe("sarvam-ai");
    expect(matchSlugs(refs, { name: "Something Else", domain: "razorpay.com" })[0]?.slug).toBe("razorpay");
    expect(matchSlugs(refs, { name: "Totally Unknown Co", domain: "unknown.io" })).toEqual([]);
  });
  it("derives brand labels from domains", () => {
    expect(domainLabel("app.aampe.co.in")).toBe("aampe");
    expect(domainLabel("https://www.1mg.com/x")).toBe("1mg");
  });
});

describe("Peak XV insights index and posts", () => {
  const items = parseInsightsIndex(indexHtml);
  it("reads type and the real publish date for each post", () => {
    const b = items.find((i) => /blacksmith/.test(i.url))!;
    expect(b.kind).toBe("Blog");
    expect(b.publishedAt?.toISOString().slice(0, 10)).toBe("2026-08-12");
    expect(items.find((i) => /vanta/.test(i.url))?.publishedAt).toBeNull();
  });
  it("parses long dates strictly", () => {
    expect(parseLongDate("August 12, 2026")?.toISOString()).toBe("2026-08-12T00:00:00.000Z");
    expect(parseLongDate("Smarch 3, 2026")).toBeNull();
    expect(parseLongDate("")).toBeNull();
  });
  it("builds a signal from a lead-investor post (amount, stage, company from slug)", () => {
    const post = parsePostPage(fx("peakxv-insight-blacksmith.html"))!;
    const slugs = new Set(["blacksmith"]);
    const s = signalFromPost(post, "https://www.peakxv.com/insight/b", null, slugs)!;
    expect(s.companyName).toBe("Blacksmith");
    expect(s.stage).toBe("series-b");
    expect(s.fundingAmount).toBe(45_000_000);
    expect(s.publishedAt?.toISOString().slice(0, 10)).toBe("2026-08-12");
    expect(s.sourceName).toBe("Peak XV Partners");
  });
  it("drops the post rather than guess when no company can be named", () => {
    const post = parsePostPage(fx("peakxv-insight-blacksmith.html"))!;
    expect(signalFromPost(post, "u", null, null)).toBeNull();
    expect(signalFromPost({ ...post, title: "Three New Funds for Exceptional Founders" }, "u", null, new Set(["blacksmith"]))).toBeNull();
  });
  it("reads an 'Investing in X' post", () => {
    const post = parsePostPage(fx("peakxv-insight-luminai.html"))!;
    const s = signalFromPost(post, "u", null, null)!;
    expect(s.companyName).toBe("Luminai");
    expect(s.fundingAmount).toBe(38_000_000);
    expect(s.stage).toBe("series-b");
  });
  it("ignores retrospectives / essays", () => {
    const post = parsePostPage(fx("peakxv-insight-ipo.html"))!;
    expect(signalFromPost(post, "u", null, null)).toBeNull();
  });
});

describe("Peak XV discover", () => {
  it("returns in-window investment posts, skipping others", async () => {
    const { ctx, fetched } = fakeCtx();
    const out = await peakxv.discover!(ctx);
    expect(out.map((s) => s.companyName)).toEqual(["Blacksmith"]);
    // only in-window Blog/News posts are fetched (Newsletter, Video, and old posts are not)
    expect(details(fetched).filter((u) => u.includes("/insight/"))).toHaveLength(1);
  });
  it("skips known urls", async () => {
    const { ctx, fetched } = fakeCtx({ isKnownUrl: (u) => /blacksmith/.test(u) });
    expect(await peakxv.discover!(ctx)).toEqual([]);
    expect(details(fetched)).toEqual([]);
  });
  it("skips posts older than the window", async () => {
    const { ctx, fetched } = fakeCtx({ now: new Date("2026-10-12T00:00:00Z") });
    expect(await peakxv.discover!(ctx)).toEqual([]);
    expect(details(fetched)).toEqual([]);
  });
  it("respects maxPages and skips non-investment posts", async () => {
    const { ctx, fetched } = fakeCtx({ now: new Date("2026-01-20T00:00:00Z"), windowDays: 400, maxPages: 2 });
    const out = await peakxv.discover!(ctx);
    expect(details(fetched).length).toBeLessThanOrEqual(2);
    expect(out.every((s) => s.publishedAt)).toBe(true);
  });
});

describe("Peak XV findEntry", () => {
  it("resolves Aampe with one detail fetch", async () => {
    const { ctx, fetched } = fakeCtx();
    const e = await peakxv.findEntry!(ctx, { name: "Aampe Technologies Pvt Ltd", domain: "aampe.com" });
    expect(e?.companyName).toBe("Aampe");
    expect(details(fetched)).toEqual(["https://www.peakxv.com/companies/aampe"]);
  });
  it("does not fetch any detail page on a miss", async () => {
    const { ctx, fetched } = fakeCtx();
    expect(await peakxv.findEntry!(ctx, { name: "Zzyzx Quantum Holdings", domain: "zzyzx.example" })).toBeNull();
    expect(details(fetched)).toEqual([]);
  });
  it("rejects a same-name page whose website domain clashes", async () => {
    const { ctx } = fakeCtx();
    expect(await peakxv.findEntry!(ctx, { name: "Aampe", domain: "aampe-labs.io" })).toBeNull();
  });
});
