import { describe, expect, it } from "vitest";
import { brandLabels, candidateHosts, pageNamesCompany, resolveOfficialWebsite } from "@/lib/research/website";
import type { PageFetcher } from "@/lib/contacts/http";

const html = (title: string, body = "") => `<html><head><title>${title}</title></head><body><h1>${title}</h1>${body}</body></html>`;
const RICH = html("Globally Top Semiconductor Solutions Company | Tessolve", `<p>${"Tessolve engineering services and products. ".repeat(60)}</p>` + Array.from({ length: 30 }, (_, i) => `<a href="/p${i}">Page ${i}</a>`).join(""));
const STUB = html("Tessolve");

const site = (pages: Record<string, { html: string; finalUrl?: string }>): PageFetcher => async (url) => {
  const p = pages[url];
  if (!p) throw new Error("fetch failed");
  return { url: p.finalUrl ?? url, status: 200, contentType: "text/html", text: p.html };
};
const dnsFor = (hosts: string[]) => async (h: string) => hosts.includes(h);

describe("brand labels and candidate domains", () => {
  it("drops legal suffixes and descriptive words", () => {
    expect(brandLabels("Tessolve Semiconductor Pvt Ltd")).toEqual(["tessolve", "tessolvesemiconductor"]);
    expect(brandLabels("Knocksense")).toEqual(["knocksense"]);
    expect(brandLabels("Nimbus AI Technologies Pvt. Ltd.")).toEqual(["nimbus"]);
  });
  it("guesses the common Indian startup TLDs, most likely first", () => {
    expect(candidateHosts("Knocksense").slice(0, 3)).toEqual(["knocksense.com", "knocksense.in", "knocksense.co.in"]);
  });
});

describe("homepage verification", () => {
  it("accepts a page that names the company and rejects parked or unrelated pages", () => {
    expect(pageNamesCompany(html("Tessolve | Semiconductor services"), "Tessolve Semiconductor")).toBe(true);
    expect(pageNamesCompany(html("Acme Corp"), "Tessolve Semiconductor")).toBe(false);
    expect(pageNamesCompany(html("tessolve.in", "<p>This domain is for sale</p>"), "Tessolve Semiconductor")).toBe(false);
  });
});

describe("resolveOfficialWebsite", () => {
  it("finds a site that only serves www (apex doesn't resolve)", async () => {
    const r = await resolveOfficialWebsite("Tessolve Semiconductor", { dns: dnsFor(["www.tessolve.com"]), fetcher: site({ "https://www.tessolve.com/": { html: RICH } }) });
    expect(r?.url).toBe("https://www.tessolve.com/");
  });

  it("prefers the real site over a one-line placeholder on another TLD", async () => {
    const r = await resolveOfficialWebsite("Tessolve Semiconductor", {
      dns: dnsFor(["tessolve.in", "www.tessolve.com"]),
      fetcher: site({ "https://tessolve.in/": { html: STUB }, "https://www.tessolve.com/": { html: RICH } }),
    });
    expect(r?.url).toBe("https://www.tessolve.com/");
  });

  it("never accepts a guess whose page doesn't name the company, and returns null when nothing matches", async () => {
    const other = await resolveOfficialWebsite("Tessolve Semiconductor", { dns: dnsFor(["tessolve.com"]), fetcher: site({ "https://tessolve.com/": { html: html("Some Other Company") } }) });
    expect(other).toBeNull();
    expect(await resolveOfficialWebsite("Zzyzx Made Up", { dns: dnsFor([]), fetcher: site({}) })).toBeNull();
  });

  it("survives unreachable guesses and counts redirects to one site once", async () => {
    const r = await resolveOfficialWebsite("Knocksense", {
      dns: dnsFor(["knocksense.com", "knocksense.in"]),
      fetcher: site({ "https://knocksense.in/": { html: RICH.replace(/Tessolve/g, "Knocksense"), finalUrl: "https://www.knocksense.com/" } }),
    });
    expect(r?.url).toBe("https://www.knocksense.com/");
  });
});
