import * as cheerio from "cheerio";
import type { InvestorSite, PortfolioEntry, SiteContext } from "../types";
import { domainFromUrl, normalizeCompanyName } from "@/lib/util/text";

/**
 * India Quotient (Webflow site). There are no per-company pages, no sitemap and no dated announcement feed
 * (blog/podcast live on Substack/Medium/YouTube), so only the single /portfolio listing is usable: one fetch,
 * cached by the context, parsed into cards. No discovery role.
 * Cards carry: id slug, website, one-line description, category, founders ("Who's in Charge?"), "Exited" flag.
 * They do NOT carry a display name, stage, year or location; those stay null.
 */
const BASE_URL = "https://www.indiaquotient.in";
const PORTFOLIO_URL = `${BASE_URL}/portfolio`;

export interface IqCard {
  slug: string;
  name: string;
  website: string | null;
  description: string | null;
  sector: string | null;
  founders: { name: string; role: string | null }[];
  exited: boolean;
}

const clean = (s: string | undefined | null): string | null => {
  const t = (s ?? "").replace(/\s+/g, " ").trim();
  return t ? t : null;
};

/** "convin-ai" → "Convin Ai". The site publishes no display name, so this is only a label derived from the slug. */
const nameFromSlug = (slug: string): string =>
  slug.replace(/[-_]+/g, " ").trim().replace(/\b[a-z]/g, (c) => c.toUpperCase());

/** Parses the /portfolio listing. Returns [] on a changed layout; never throws. Cards are de-duplicated by slug. */
export function parseIqPortfolio(html: string): IqCard[] {
  try {
    const $ = cheerio.load(html);
    const cards: IqCard[] = [];
    const seen = new Set<string>();
    $(".w-dyn-item").each((_, el) => {
      const item = $(el);
      const box = item.children(".com_box");
      const slug = clean(item.children(".dummy-div").attr("id"));
      if (!box.length || !slug || seen.has(slug)) return;
      seen.add(slug);
      const href = box.find("a.link_logo").first().attr("href")?.trim() ?? "";
      const website = /^https?:\/\//i.test(href) ? href : null;
      const founders: IqCard["founders"] = [];
      box.find(".all_link .name_link").each((__, n) => {
        const name = clean($(n).text());
        if (name && !founders.some((f) => f.name === name)) founders.push({ name, role: null });
      });
      cards.push({
        slug,
        name: nameFromSlug(slug),
        website,
        description: clean(box.find(".com_desc > div").first().text()),
        sector: clean(box.find(".port_cat").first().text()),
        founders,
        exited: /exited/i.test(box.find(".exited_txt").first().text()),
      });
    });
    return cards;
  } catch {
    return [];
  }
}

const compact = (s: string): string => normalizeCompanyName(s);

/** A card matches only on the same website host, or on an identical normalized name (slug or domain label). */
export function matchIqCard(cards: IqCard[], q: { name: string; domain: string | null }): IqCard | null {
  const wantDomain = domainFromUrl(q.domain);
  const wantName = compact(q.name);
  if (wantDomain) {
    const byDomain = cards.filter((c) => domainFromUrl(c.website) === wantDomain);
    if (byDomain.length === 1) return byDomain[0];
  }
  if (!wantName) return null;
  const byName = cards.filter((c) => {
    if (compact(c.slug.replace(/[-_]+/g, " ")) === wantName) return true;
    const host = domainFromUrl(c.website);
    return host ? compact(host.split(".")[0]) === wantName : false;
  });
  return byName.length === 1 ? byName[0] : null;
}

export const cardToEntry = (c: IqCard): PortfolioEntry => ({
  pageUrl: c.website ? `${PORTFOLIO_URL}#${c.slug}` : PORTFOLIO_URL,
  companyName: c.name,
  website: c.website,
  sector: c.sector,
  stage: null,
  partneredYear: null,
  location: null,
  description: c.description,
  founders: c.founders,
  coInvestors: [],
  rationale: [],
  status: c.exited ? "exited" : "active",
});

export const indiaquotient: InvestorSite = {
  key: "india_quotient",
  name: "India Quotient",
  baseUrl: BASE_URL,
  roles: ["enrichment", "verification"],
  async findEntry(ctx: SiteContext, q) {
    let page;
    try {
      page = await ctx.fetch(PORTFOLIO_URL);
    } catch (err) {
      ctx.note(`india_quotient: portfolio fetch failed (${err instanceof Error ? err.message : "error"})`);
      return null;
    }
    if (page.status !== 200) return null;
    const card = matchIqCard(parseIqPortfolio(page.text), q);
    return card ? cardToEntry(card) : null;
  },
};
