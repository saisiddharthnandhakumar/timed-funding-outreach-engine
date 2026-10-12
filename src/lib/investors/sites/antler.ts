import * as cheerio from "cheerio";
import type { InvestorSite } from "../types";

/**
 * Antler India: UNSUPPORTED for the pipeline (roles: []).
 *
 * What was verified (2026-10-12):
 *  - Antler's public site is Webflow. `/portfolio` is server-rendered, 52 company cards per page, alphabetical,
 *    paged with `?0b933bfd_page=N` (~34 pages, ~250 KB each, ~1,800 companies across all countries). Each card has
 *    name, one-line description, country, sector, cohort year and the company's own website. No founders, stage or
 *    amounts, and no server-side country filter (the India filter is client-side JS over the loaded cards).
 *  - Per-company pages live under `/portfolio/company/`, which robots.txt disallows, so they are off limits.
 *  - robots.txt asks for `Crawl-delay: 10`; the shared site context spaces requests 600 ms.
 *  - The sitemap lists no portfolio or announcement pages with dates, so there is no discovery surface.
 * A company lookup would need a binary search over ~34 alphabetical 250 KB pages for every miss, which breaks the
 * "a miss costs zero fetches" contract and the crawl-delay, for data that is only name/country/sector/year. So the
 * site is registered with no roles. `parsePortfolioCards` is kept (pure, tested) in case a cheaper surface appears.
 */
export interface AntlerCard {
  name: string;
  description: string | null;
  location: string | null;
  sector: string | null;
  year: number | null;
  website: string | null;
}

export function parsePortfolioCards(html: string): AntlerCard[] {
  try {
    const $ = cheerio.load(html);
    const cards: AntlerCard[] = [];
    $(".portco_card").each((_, el) => {
      const card = $(el);
      const name = card.find('[fs-cmsfilter-field="name"]').first().text().trim();
      if (!name) return;
      const tag = (field: string) => card.find(`.tag_small_wrap[fs-cmsfilter-field="${field}"]`).first().text().trim() || null;
      const description = card.find('[fs-cmsfilter-field="description"]').first().text().trim() || null;
      const href = card.find(".clickable_link").first().attr("href")?.trim() ?? "";
      const year = Number(tag("year"));
      // The location tag's wrapper attribute is the country name itself.
      const location = card.find(".tag_small_wrap").first().text().trim() || null;
      cards.push({
        name,
        description,
        location,
        sector: tag("sector"),
        year: Number.isInteger(year) && year >= 2000 && year <= 2100 ? year : null,
        website: /^https?:\/\//i.test(href) ? href : null,
      });
    });
    return cards;
  } catch {
    return [];
  }
}

export const antler: InvestorSite = {
  key: "antler_india",
  name: "Antler India",
  baseUrl: "https://www.antler.co",
  roles: [],
};
