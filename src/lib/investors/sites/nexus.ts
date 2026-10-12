import * as cheerio from "cheerio";
import { ldOfType, readSitemap, type SitemapEntry } from "@/lib/investors/html";
import type { InvestorSite, PortfolioEntry, SiteContext } from "@/lib/investors/types";
import { domainFromUrl, normalizeCompanyName, stripHtml } from "@/lib/util/text";

const BASE = "https://www.nexusvp.com";

/**
 * Nexus Venture Partners (Webflow site). robots.txt only lists the sitemap. /in/... is an India-localised mirror of the
 * same pages (same data), so only the canonical /companies/<slug> pages are used.
 * There is no news/blog/announcements surface (/news redirects home), so this site is enrichment-only.
 * Company detail pages carry: name, one-line description, website, sector(s), location, status, partners and founders.
 * They do NOT carry stage, amount or partnering year, so those stay null.
 */

export interface NexusSlug {
  slug: string;
  url: string;
}

/** Portfolio slugs from the sitemap (canonical /companies/<slug> only, not the /in mirror). */
export function parseNexusSlugs(entries: SitemapEntry[]): NexusSlug[] {
  const seen = new Set<string>();
  const out: NexusSlug[] = [];
  for (const e of entries) {
    const m = e.loc.match(/^https?:\/\/(?:www\.)?nexusvp\.com\/companies\/([a-z0-9][a-z0-9-]*)\/?$/i);
    if (!m) continue;
    const slug = m[1].toLowerCase();
    if (seen.has(slug)) continue;
    seen.add(slug);
    out.push({ slug, url: `${BASE}/companies/${slug}` });
  }
  return out;
}

const slugKey = (slug: string) => normalizeCompanyName(slug.replace(/-/g, " "));

/** Slugs whose name plausibly is this company: normalised name equality, or slug equal to the domain's main label. */
export function matchSlugs(slugs: NexusSlug[], q: { name: string; domain: string | null }): NexusSlug[] {
  const nameKey = normalizeCompanyName(q.name);
  const label = q.domain ? domainFromUrl(q.domain)?.split(".").slice(-2, -1)[0] : null;
  const labelKey = label ? normalizeCompanyName(label) : null;
  if (!nameKey && !labelKey) return [];
  return slugs.filter((s) => {
    const k = slugKey(s.slug);
    return (nameKey && k === nameKey) || (labelKey && k === labelKey);
  });
}

const clean = (s: string) => s.replace(/\s+/g, " ").trim();

function dataItem($: cheerio.CheerioAPI, label: string): string[] {
  const out: string[] = [];
  $(".company-header_data-item").each((_, el) => {
    if (clean($(el).find(".text-style-tagline").first().text()).toLowerCase() !== label.toLowerCase()) return;
    const leaves = $(el).find("div").filter((__, d) => !$(d).children("div").length && !$(d).is(".text-style-tagline, .company-header_data-line"));
    leaves.each((__, l) => {
      const t = clean($(l).text());
      if (t && !out.includes(t)) out.push(t);
    });
  });
  return out;
}

/** Parse one /companies/<slug> page. Returns null when it isn't a company page. Never throws. */
export function parseNexusCompany(html: string, pageUrl: string): PortfolioEntry | null {
  try {
    const $ = cheerio.load(html);
    const profile = ldOfType(html, "ProfilePage");
    const org = (profile?.mainEntity ?? null) as Record<string, unknown> | null;
    const name = clean(String(org?.name ?? profile?.name ?? "")) || clean($(".company-header_top-left .w-embed strong").first().text()).replace(/\.$/, "");
    if (!name || !$(".company-header_data-item").length) return null;

    const website = $('.company-header_top-left a[aria-label="Open website in new tab"]').first().attr("href") ?? (typeof org?.url === "string" ? org.url : null);
    const rawDesc = typeof org?.description === "string" ? org.description : typeof profile?.description === "string" ? profile.description : "";
    const description = stripHtml(rawDesc) || null;

    const sector = dataItem($, "Sector");
    const location = dataItem($, "Location");
    const status = dataItem($, "Status");

    const founders: PortfolioEntry["founders"] = [];
    $(".founder_name-role").each((_, el) => {
      const n = clean($(el).find("h2, h3, h4").first().text());
      if (!n || founders.some((f) => f.name === n)) return;
      founders.push({ name: n, role: clean($(el).find("p").first().text()) || null });
    });

    return {
      pageUrl,
      companyName: name,
      website: website && domainFromUrl(website) ? website : null,
      sector: sector.length ? sector.join(", ") : null,
      stage: null,
      partneredYear: null,
      location: location.length ? location.join(", ") : null,
      description,
      founders,
      coInvestors: [],
      rationale: [],
      status: status.length ? status.join(", ") : null,
    };
  } catch {
    return null;
  }
}

/** Registrable-ish host (last two labels) for a loose same-company check. */
const rootHost = (u: string | null) => domainFromUrl(u)?.split(".").slice(-2).join(".") ?? null;

export async function findNexusEntry(ctx: SiteContext, q: { name: string; domain: string | null }): Promise<PortfolioEntry | null> {
  const slugs = parseNexusSlugs(await readSitemap(ctx, `${BASE}/sitemap.xml`));
  const candidates = matchSlugs(slugs, q);
  if (candidates.length !== 1) return null; // none (no fetch) or ambiguous
  const page = await ctx.fetch(candidates[0].url);
  if (page.status !== 200) return null;
  const entry = parseNexusCompany(page.text, candidates[0].url);
  if (!entry) return null;
  const nameOk = normalizeCompanyName(entry.companyName) === normalizeCompanyName(q.name);
  const a = rootHost(q.domain);
  const b = rootHost(entry.website);
  if (a && b && a !== b) return null; // same name, different company
  if (!nameOk && !(a && b && a === b)) return null;
  return entry;
}

export const nexus: InvestorSite = {
  key: "nexus_vp",
  name: "Nexus Venture Partners",
  baseUrl: BASE,
  roles: ["enrichment"],
  findEntry: findNexusEntry,
};
