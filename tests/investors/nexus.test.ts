import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { findNexusEntry, matchSlugs, nexus, parseNexusCompany, parseNexusSlugs } from "@/lib/investors/sites/nexus";
import { readSitemap } from "@/lib/investors/html";
import type { SiteContext } from "@/lib/investors/types";

const fx = (f: string) => readFileSync(`tests/fixtures/investors/${f}`, "utf8");

function fakeCtx(pages: Record<string, string>) {
  const fetched: string[] = [];
  const ctx: SiteContext = {
    now: new Date("2026-10-12T00:00:00Z"),
    windowDays: 30,
    maxPages: 6,
    isKnownUrl: () => false,
    note: () => {},
    async fetch(url) {
      fetched.push(url);
      const text = pages[url];
      return { url, status: text === undefined ? 404 : 200, text: text ?? "" };
    },
  };
  return { ctx, fetched };
}
const pages = () => ({
  "https://www.nexusvp.com/sitemap.xml": fx("nexus-sitemap.xml"),
  "https://www.nexusvp.com/companies/zomato": fx("nexus-company-zomato.html"),
  "https://www.nexusvp.com/companies/whitehat-jr": fx("nexus-company-whitehat-jr.html"),
  "https://www.nexusvp.com/companies/postman": fx("nexus-company-postman.html"),
});

describe("nexus sitemap slugs", () => {
  it("keeps only canonical /companies/<slug>, not the /in mirror, listing, or team", async () => {
    const { ctx } = fakeCtx(pages());
    const slugs = parseNexusSlugs(await readSitemap(ctx, "https://www.nexusvp.com/sitemap.xml"));
    expect(slugs.map((s) => s.slug)).toContain("zomato");
    expect(slugs.every((s) => /^https:\/\/www\.nexusvp\.com\/companies\/[a-z0-9-]+$/.test(s.url))).toBe(true);
    expect(new Set(slugs.map((s) => s.slug)).size).toBe(slugs.length);
  });
  it("matches by normalised name or domain label", async () => {
    const { ctx } = fakeCtx(pages());
    const slugs = parseNexusSlugs(await readSitemap(ctx, "https://www.nexusvp.com/sitemap.xml"));
    expect(matchSlugs(slugs, { name: "Cognida Technologies Pvt Ltd", domain: null }).map((s) => s.slug)).toEqual(["cognida-ai"]);
    expect(matchSlugs(slugs, { name: "Infra.Market", domain: null }).map((s) => s.slug)).toEqual(["infra-market"]);
    expect(matchSlugs(slugs, { name: "WhiteHat Jr Pvt Ltd", domain: null }).map((s) => s.slug)).toEqual(["whitehat-jr"]);
    expect(matchSlugs(slugs, { name: "Something Else", domain: "https://www.postman.com" }).map((s) => s.slug)).toEqual(["postman"]);
    expect(matchSlugs(slugs, { name: "Nope Inc", domain: null })).toEqual([]);
  });
});

describe("parseNexusCompany", () => {
  it("parses Zomato", () => {
    const e = parseNexusCompany(fx("nexus-company-zomato.html"), "https://www.nexusvp.com/companies/zomato")!;
    expect(e.companyName).toBe("Zomato");
    expect(e.website).toBe("https://www.zomato.com/");
    expect(e.sector).toBe("Consumer");
    expect(e.location).toBe("India");
    expect(e.status).toBe("M&A");
    expect(e.description).toBe("On demand food delivery platform. (acquired Runnr)");
    expect(e.founders.map((f) => f.name)).toEqual(["Deepinder Goyal", "Mohit Gupta", "Gaurav Munjal", "Pankaj Chaddah"]);
    expect(e.stage).toBeNull();
    expect(e.rationale).toEqual([]);
  });
  it("keeps multi-country locations and multi sectors", () => {
    expect(parseNexusCompany(fx("nexus-company-whitehat-jr.html"), "u")!.location).toBe("U.S., India");
    const p = parseNexusCompany(fx("nexus-company-postman.html"), "u")!;
    expect(p.sector).toBe("Enterprise, AI");
    expect(p.founders[0]).toEqual({ name: "Abhinav Asthana", role: "CEO & Co-Founder" });
  });
  it("returns null for unrelated pages", () => {
    expect(parseNexusCompany("<html><body><p>hi</p></body></html>", "u")).toBeNull();
    expect(parseNexusCompany("", "u")).toBeNull();
  });
});

describe("findEntry", () => {
  it("fetches exactly one detail page for a match", async () => {
    const { ctx, fetched } = fakeCtx(pages());
    const e = await findNexusEntry(ctx, { name: "Zomato Ltd", domain: "zomato.com" });
    expect(e?.companyName).toBe("Zomato");
    expect(fetched).toEqual(["https://www.nexusvp.com/sitemap.xml", "https://www.nexusvp.com/companies/zomato"]);
  });
  it("fetches no detail page when no slug matches", async () => {
    const { ctx, fetched } = fakeCtx(pages());
    expect(await findNexusEntry(ctx, { name: "Totally Made Up Co", domain: "madeup.example" })).toBeNull();
    expect(fetched).toEqual(["https://www.nexusvp.com/sitemap.xml"]);
  });
  it("rejects a same-name company on a different domain", async () => {
    const { ctx } = fakeCtx(pages());
    expect(await findNexusEntry(ctx, { name: "Zomato", domain: "zomato.example.org" })).toBeNull();
  });
  it("is enrichment-only: no discovery", () => {
    expect(nexus.roles).toEqual(["enrichment"]);
    expect(nexus.discover).toBeUndefined();
  });
});
