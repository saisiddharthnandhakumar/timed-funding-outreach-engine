import * as cheerio from "cheerio";
import { jsonLd, normalizeStage, parseAmount, readSitemap, withinDays } from "../html";
import { emptySignal, type DiscoverySignal, type InvestorSite, type PortfolioEntry, type SiteContext } from "../types";
import { domainFromUrl, normalizeCompanyName } from "@/lib/util/text";

const BASE = "https://www.stellarisvp.com";
const SOURCE = { name: "Stellaris Venture Partners" };
const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];

export type InsightKind = "news" | "blog" | "podcast" | "other";

/** One card on the Insights index (stellarisvp.com/insights). `url` is the stellarisvp page, or the press article for news. */
export interface InsightCard {
  url: string;
  kind: InsightKind;
  title: string;
  category: string | null;
  sector: string | null;
  date: Date | null;
}

/** "July 23, 2026" → that calendar day at 12:00 UTC (the site only carries a day). Null when unparseable. */
export function parseCardDate(text: string | null | undefined): Date | null {
  const m = text?.trim().match(/^([A-Za-z]+)\s+(\d{1,2}),?\s+(\d{4})$/);
  if (!m) return null;
  const mon = MONTHS.indexOf(m[1].toLowerCase());
  if (mon < 0) return null;
  const d = new Date(Date.UTC(Number(m[3]), mon, Number(m[2]), 12));
  return Number.isNaN(d.getTime()) ? null : d;
}

const kindOf = (label: string, href: string): InsightKind => {
  const l = label.trim().toLowerCase();
  if (l === "news" || l === "blog" || l === "podcast") return l;
  if (href.startsWith("/blog/")) return "blog";
  if (href.startsWith("/podcast/")) return "podcast";
  return "other";
};

/**
 * Cards of the Insights index. Each `.insights_grid-item` holds a link, a type label, the title, hidden CMS fields
 * (category, sector, sortable date). Layout changes yield fewer cards, never an exception.
 */
export function parseInsightsIndex(html: string, base = BASE): InsightCard[] {
  const out = new Map<string, InsightCard>();
  try {
    const $ = cheerio.load(html);
    $(".insights_grid-item").each((_, el) => {
      const item = $(el);
      const href = item.find("a.insight-link").first().attr("href")?.trim();
      const title = item.find("[insight-title]").first().text().replace(/\s+/g, " ").trim();
      if (!href || !title) return;
      let url: string;
      try {
        url = new URL(href, base).toString();
      } catch {
        return;
      }
      if (out.has(url)) return;
      const label = item.find(".insights_grid-item-bottom .font-roboto-mono").not(".w-condition-invisible").first().text();
      const hidden = (field: string, attr: "fs-cmsfilter-field" | "fs-cmssort-field" = "fs-cmsfilter-field") =>
        item.find(`.hidden-cms-item[${attr}="${field}"]`).first().text().replace(/\s+/g, " ").trim() || null;
      out.set(url, { url, kind: kindOf(label, href), title, category: hidden("category"), sector: hidden("sector"), date: parseCardDate(hidden("datename", "fs-cmssort-field")) });
    });
  } catch {
    return [];
  }
  return [...out.values()];
}

const COMPANY_DESCRIPTOR = /\b(startup|start-up|firm|platform|company|marketplace|app|unicorn|maker|provider|brand|studio|pharmacy|network|player)\b/gi;
const RAISE_VERB = /\s(?:raises?|raised|secures?|bags?|lands?|bags)\b/i;

/**
 * "Voice AI firm Arrowhead raises $3 million …" → "Arrowhead"; "CARPL.ai raises $10M …" → "CARPL.ai".
 * Only when the name is unambiguous: a single token, or whatever follows a descriptor word (startup/firm/platform…).
 */
export function companyFromFundingHeadline(headline: string): string | null {
  const m = headline.match(RAISE_VERB);
  if (!m || m.index === undefined) return null;
  let prefix = headline.slice(0, m.index).trim().replace(/^stellaris[-\s]backed\s+/i, "");
  if (!prefix || /[,;:]|\s(?:and|&)\s/i.test(prefix)) return null;
  let last = -1;
  let len = 0;
  for (const d of prefix.matchAll(COMPANY_DESCRIPTOR)) {
    last = d.index ?? -1;
    len = d[0].length;
  }
  if (last >= 0) prefix = prefix.slice(last + len).trim();
  else if (/\s/.test(prefix)) return null;
  prefix = prefix.replace(/^the\s+/i, "");
  return prefix && prefix.length <= 40 && !/^stellaris/i.test(prefix) ? prefix : null;
}

const WHY_PATTERN = /(?:why we (?:invested in|doubled down on|backed)|our (?:follow-on )?investment in|investing in|backing)\s+(.+?)\s*[.!?]*$/i;

/** "…: Why We Invested in Pinegap" → "Pinegap". Null when the tail looks like a sentence rather than a name. */
export function companyFromInvestmentTitle(title: string): string | null {
  const name = title.match(WHY_PATTERN)?.[1]?.trim();
  if (!name || /[,;:]/.test(name) || name.split(/\s+/).length > 4) return null;
  return name;
}

const FUNDING_HEADLINE = /\b(?:raises?|raised|secures?|bags?|lands?)\b/i;

/** Turn one index card into a signal, or null when it is not an investment/funding post. */
export function signalFromCard(card: InsightCard): DiscoverySignal | null {
  if (card.kind === "news") {
    const fundingLike = /stellaris|\$|₹|funding|round|series/i.test(card.title);
    if (!FUNDING_HEADLINE.test(card.title) || !fundingLike) return null;
    const amount = parseAmount(card.title);
    return emptySignal(SOURCE, {
      signalType: "portfolio_funding_news",
      sourceUrl: card.url,
      headline: card.title,
      publishedAt: card.date,
      companyName: companyFromFundingHeadline(card.title),
      sector: card.sector,
      stage: normalizeStage(card.title),
      fundingAmount: amount?.amount ?? null,
      fundingCurrency: amount?.currency ?? null,
    });
  }
  if (card.kind === "blog") {
    const flagged = /why we invested/i.test(card.category ?? "");
    const named = WHY_PATTERN.test(card.title);
    if (!flagged && !named) return null;
    const investing = /(?:investment in|investing in|backing)\s/i.test(card.title) && !/why we/i.test(card.title);
    return emptySignal(SOURCE, {
      signalType: investing ? "investment_announcement" : "why_we_invested",
      sourceUrl: card.url,
      headline: card.title,
      publishedAt: card.date,
      companyName: companyFromInvestmentTitle(card.title),
      sector: card.sector,
    });
  }
  return null;
}

/**
 * All the cards (news headline, date, sector, press link; blog titles and dates) are on one index page, so discovery
 * costs a single request and never fetches a detail page. Undated cards are dropped.
 */
async function discover(ctx: SiteContext): Promise<DiscoverySignal[]> {
  const page = await ctx.fetch(`${BASE}/insights`);
  if (page.status !== 200) {
    ctx.note(`stellaris: insights index returned HTTP ${page.status}`);
    return [];
  }
  const cards = parseInsightsIndex(page.text);
  // The index is ~2.6 MB and the news grid is its last block: a fetcher capped below that silently loses every news card.
  if (!/<\/html>\s*$/i.test(page.text)) ctx.note(`stellaris: insights index looks truncated at ${page.text.length} bytes; news cards need a fetcher allowing ~3 MB`);
  if (!cards.length) ctx.note("stellaris: insights index parsed but no cards found (layout changed?)");
  const out: DiscoverySignal[] = [];
  for (const card of cards) {
    if (!card.date || !withinDays(card.date, ctx.now, ctx.windowDays)) continue;
    if (ctx.isKnownUrl(card.url)) continue;
    const signal = signalFromCard(card);
    if (signal) out.push(signal);
  }
  return out;
}

/** Portfolio page slugs from the sitemap (`/portfolio/<slug>`). */
export function portfolioSlugs(urls: string[]): { slug: string; url: string }[] {
  const out: { slug: string; url: string }[] = [];
  for (const url of urls) {
    const m = url.match(/^https?:\/\/[^/]+\/portfolio\/([a-z0-9][a-z0-9-]*)\/?$/i);
    if (m) out.push({ slug: m[1], url });
  }
  return out;
}

/** Slugs whose name equals the company name once legal/generic suffixes are dropped ("pibit-ai" ~ "Pibit.AI"). */
export function matchSlugs(slugs: { slug: string; url: string }[], name: string): { slug: string; url: string }[] {
  const want = normalizeCompanyName(name);
  if (!want) return [];
  return slugs.filter((s) => normalizeCompanyName(s.slug.replace(/-/g, " ")) === want || normalizeCompanyName(s.slug.replace(/-/g, "")) === want);
}

const clean = (s: string) => s.replace(/\s+/g, " ").trim();

/** Parse one /portfolio/<slug> page (Webflow). Null when there is no company name. */
export function parsePortfolioEntry(html: string, pageUrl: string): PortfolioEntry | null {
  try {
    const $ = cheerio.load(html);
    const ld = jsonLd(html).find((o) => o["@type"] === "ProfilePage");
    const about = (ld?.about ?? {}) as Record<string, unknown>;
    const entity = (ld?.mainEntity ?? {}) as Record<string, unknown>;
    const name = clean($("h1").first().text()) || (typeof about.name === "string" ? clean(about.name) : "");
    if (!name) return null;

    const rawWebsite = $("a.company_website-link").first().attr("href")?.trim() || (typeof about.url === "string" ? about.url : "");
    const website = /^https?:\/\/[^/\s]+\.[^/\s]+/i.test(rawWebsite) ? rawWebsite : null;
    const sectors = $(".theme_list .text-size-regular").map((_, e) => clean($(e).text())).get().filter(Boolean);
    const description = clean($(".company_description > .text-size-medium").first().text()) || null;
    const founders = $(".company_founder-item .text-size-medium")
      .map((_, e) => clean($(e).text()))
      .get()
      .filter(Boolean)
      .map((n) => ({ name: n, role: null as string | null }));

    const info = new Map<string, string>();
    const coInvestors: string[] = [];
    $(".company_info").each((_, el) => {
      const box = $(el);
      if (box.hasClass("w-condition-invisible")) return;
      const label = clean(box.children().first().text()).toLowerCase();
      const value = box.find(".company_details-text").first();
      if (!label || !value.length) return;
      if (label === "co-investor" || label === "co-investors") {
        // Co-investors are one per line in the markup; a single line stays whole (names can't be split reliably).
        for (const line of value.text().split(/\r?\n/)) if (clean(line)) coInvestors.push(clean(line));
      } else info.set(label, clean(value.text()));
    });

    const year = Number(info.get("partnered"));
    const props = Array.isArray(entity.additionalProperty) ? (entity.additionalProperty as Record<string, unknown>[]) : [];
    // Multi-line co-investor values make the JSON-LD invalid on some pages, so fall back to the raw text.
    const status = props.find((p) => p.name === "Company Status")?.value ?? html.match(/"Company Status",\s*"value":\s*"([^"\n]*)"/)?.[1];

    return {
      pageUrl,
      companyName: name,
      website,
      sector: sectors.length ? sectors.join(", ") : null,
      stage: normalizeStage(info.get("entry stage")),
      partneredYear: Number.isInteger(year) && year > 1990 && year < 2100 ? year : null,
      location: null,
      description,
      founders,
      coInvestors,
      // The "why we invested" blurb is free prose; we don't republish or paraphrase it.
      rationale: [],
      status: typeof status === "string" && status.trim() ? status.trim().toLowerCase() : null,
    };
  } catch {
    return null;
  }
}

/** True unless both sides have a domain and they are unrelated. */
const sameSite = (a: string | null, b: string | null) => !a || !b || a === b || a.endsWith(`.${b}`) || b.endsWith(`.${a}`);

async function findEntry(ctx: SiteContext, q: { name: string; domain: string | null }): Promise<PortfolioEntry | null> {
  const urls = (await readSitemap(ctx, `${BASE}/sitemap.xml`)).map((e) => e.loc);
  const candidates = matchSlugs(portfolioSlugs(urls), q.name);
  if (!candidates.length) return null;
  const page = await ctx.fetch(candidates[0].url);
  if (page.status !== 200) return null;
  const entry = parsePortfolioEntry(page.text, candidates[0].url);
  if (!entry) return null;
  if (normalizeCompanyName(entry.companyName) !== normalizeCompanyName(q.name)) return null;
  return sameSite(domainFromUrl(entry.website), q.domain ? domainFromUrl(q.domain) : null) ? entry : null;
}

export const stellaris: InvestorSite = {
  key: "stellaris_vp",
  name: "Stellaris Venture Partners",
  baseUrl: BASE,
  // The /insights index (every news item, post and podcast) is ~2.6 MB; the news grid starts ~2.1 MB in.
  maxBytes: 4_000_000,
  roles: ["discovery", "enrichment", "verification"],
  discover,
  findEntry,
};
