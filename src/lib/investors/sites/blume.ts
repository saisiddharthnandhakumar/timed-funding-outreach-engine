import * as cheerio from "cheerio";
import { canonicalizeUrl, domainFromUrl, normalizeCompanyName, truncate } from "@/lib/util/text";
import { ldOfType, normalizeStage, parseAmount, readSitemap, toDate, withinDays, type SitemapEntry } from "../html";
import { emptySignal, type DiscoverySignal, type InvestorSite, type PortfolioEntry, type SignalType, type SiteContext } from "../types";

/**
 * Blume Ventures (blume.vc). The homepage sits behind a Cloudflare challenge for our honest user-agent and is never
 * requested. What IS served normally: sitemap.xml (a sitemapindex), `/commentaries/<slug>` posts and the portfolio
 * pages, which live at the site root (`/<slug>`), listed in sitemap-startups-N.xml. robots.txt only blocks the
 * `:`-filter URLs (e.g. /startups/location:india), which we never fetch.
 */
const BASE = "https://blume.vc";
const SITEMAP_INDEX = `${BASE}/sitemap.xml`;

const clean = (s: string | undefined | null) => (s ?? "").replace(/\s+/g, " ").trim();

// ---- Discovery -------------------------------------------------------------------------------------------------

/** Slugs of commentary posts that announce an investment. Essays, reports, fund closes and how-tos don't match. */
const INVESTMENT_SLUG = /(^|-)(why-we-invested|we-invested|investing-in|invests-in|backing|partnering-with|raises|raised|announces-funding)(-|$)/;
const NOT_INVESTMENT_SLUG = /(^|-)(our-fund|fund-(i|ii|iii|iv|v|vi)|final-close|first-close|perspectives|newsletter|podcast|recommends)(-|$)/;

export const commentarySlug = (url: string): string | null => {
  try {
    const m = new URL(url).pathname.match(/^\/commentaries\/([^/:]+)\/?$/);
    return m ? m[1].toLowerCase() : null;
  } catch {
    return null;
  }
};

export function investmentKind(slug: string): SignalType | null {
  if (NOT_INVESTMENT_SLUG.test(slug) || !INVESTMENT_SLUG.test(slug)) return null;
  if (/why-we-invested|we-invested/.test(slug)) return "why_we_invested";
  if (/raises|raised|announces-funding/.test(slug)) return "portfolio_funding_news";
  return "investment_announcement";
}

/** Commentary URLs worth opening: investment-looking slugs, not known, not last modified before the window opened. */
export function candidateCommentaries(entries: SitemapEntry[], ctx: Pick<SiteContext, "now" | "windowDays" | "isKnownUrl">): { url: string; kind: SignalType; lastmod: Date | null }[] {
  const seen = new Set<string>();
  const out: { url: string; kind: SignalType; lastmod: Date | null }[] = [];
  for (const e of entries) {
    const slug = commentarySlug(e.loc);
    const kind = slug ? investmentKind(slug) : null;
    if (!slug || !kind || seen.has(slug)) continue;
    seen.add(slug);
    // lastmod is the last edit, never earlier than the publish date, so an old lastmod proves an old post.
    if (!withinDays(e.lastmod, ctx.now, ctx.windowDays) || ctx.isKnownUrl(e.loc)) continue;
    out.push({ url: e.loc, kind, lastmod: e.lastmod });
  }
  return out.sort((a, b) => (b.lastmod?.getTime() ?? 0) - (a.lastmod?.getTime() ?? 0));
}

const COMPANY_FROM_TITLE: RegExp[] = [
  /^why we (?:invested|backed) in (.+)$/i,
  /^(?:investing|backing|partnering) (?:in |with )?(.+)$/i,
  /^(.+?) (?:raises|raised|announces)\b/i,
];

export function companyFromTitle(title: string): string | null {
  const t = clean(title).replace(/\s*[-–|]\s*Blume$/i, "");
  for (const re of COMPANY_FROM_TITLE) {
    const m = t.match(re);
    if (!m) continue;
    const name = clean(m[1].split(/\s*(?::|—|–| - | \| )\s*/)[0]);
    if (name.length >= 2 && name.length <= 60 && !/^(a|an|the|our|its|their|india|indian)\b/i.test(name)) return name;
  }
  return null;
}

/** "Raghu Reddy and Kailash Sankaranarayan" from "We're backing X and Y as they build…"; [] unless every name looks like a name. */
export function foundersFromLede(lede: string): string[] {
  const m = lede.match(/(?:backing|partnering with|investing in|backed)\s+(.{3,120}?)\s+as they\b/i);
  if (!m) return [];
  const names = m[1].split(/\s*(?:,|&|\band\b)\s*/).map(clean).filter(Boolean);
  const looksLikeName = (n: string) => /^[A-Z][\p{L}.'’-]+(?: [A-Z][\p{L}.'’-]+){1,3}$/u.test(n);
  return names.length > 0 && names.length <= 5 && names.every(looksLikeName) ? names : [];
}

export interface ParsedCommentary {
  headline: string | null;
  publishedAt: Date | null;
  lede: string | null;
  /** The first two paragraphs; where the founders are usually named. */
  intro: string | null;
}

/** Title, real publish date (JSON-LD datePublished, else the visible <time>) and the first paragraph of a commentary post. */
export function parseCommentary(html: string): ParsedCommentary {
  const $ = cheerio.load(html);
  const article = ldOfType(html, "Article");
  const headline = clean($("main h1").first().text()) || clean($("meta[property='og:title']").attr("content")) || null;
  const publishedAt = toDate(article?.datePublished) ?? toDate($("main time").first().attr("datetime"));
  const lede = clean($("main p").first().text()) || null;
  const intro = clean($("main p").slice(0, 2).map((_, p) => $(p).text()).get().join(" ")) || null;
  return { headline, publishedAt, lede, intro };
}

export function signalFromCommentary(url: string, kind: SignalType, page: ParsedCommentary, now: Date, windowDays: number): DiscoverySignal | null {
  if (!page.headline || !page.publishedAt) return null; // no real date → drop rather than guess
  if (!withinDays(page.publishedAt, now, windowDays)) return null;
  const lede = page.lede ?? "";
  const amount = parseAmount(lede);
  return emptySignal(blume, {
    signalType: kind,
    sourceUrl: url,
    headline: page.headline,
    summary: lede ? truncate(lede, 300) : null,
    publishedAt: page.publishedAt,
    companyName: companyFromTitle(page.headline),
    stage: normalizeStage(lede),
    fundingAmount: amount?.amount ?? null,
    fundingCurrency: amount?.currency ?? null,
    founders: foundersFromLede(page.intro ?? lede),
  });
}

async function discover(ctx: SiteContext): Promise<DiscoverySignal[]> {
  // The index lastmods are all one rebuild timestamp, so they say nothing; the first commentary sitemap is newest-first.
  const entries = await readSitemap(ctx, SITEMAP_INDEX, { onlyChild: /sitemap-commentaries-\d+\.xml$/, maxChildren: 1 });
  const candidates = candidateCommentaries(entries, ctx).slice(0, ctx.maxPages);
  const out: DiscoverySignal[] = [];
  for (const c of candidates) {
    try {
      const page = await ctx.fetch(c.url);
      if (page.status !== 200) {
        ctx.note(`blume: ${c.url} returned HTTP ${page.status}`);
        continue;
      }
      const s = signalFromCommentary(c.url, c.kind, parseCommentary(page.text), ctx.now, ctx.windowDays);
      if (s) out.push(s);
    } catch (err) {
      ctx.note(`blume: ${c.url}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  return out;
}

// ---- Enrichment ------------------------------------------------------------------------------------------------

/** Portfolio pages are `https://blume.vc/<slug>` (one path segment); returns the slug or null. */
export function startupSlug(url: string): string | null {
  try {
    const u = new URL(url);
    const m = u.pathname.match(/^\/([a-z0-9][a-z0-9-]*)\/?$/i);
    return u.host === "blume.vc" && m ? m[1].toLowerCase() : null;
  } catch {
    return null;
  }
}

export interface StartupCandidate {
  url: string;
  slug: string;
  exact: boolean;
  /** Length difference between the normalised name and slug; smaller is closer. */
  gap: number;
}

/**
 * Slugs that plausibly belong to `name`: equal after normalisation (`confido-health` = "Confido Health Pvt Ltd"), or one
 * a prefix of the other (`ido` / "IDO Devices"). Best candidates first. Prefix-only matches are weaker, so callers
 * confirm them against the fetched page.
 */
export function matchStartups(entries: SitemapEntry[], name: string): StartupCandidate[] {
  const want = normalizeCompanyName(name);
  if (want.length < 3) return [];
  const out: StartupCandidate[] = [];
  const seen = new Set<string>();
  for (const e of entries) {
    const slug = startupSlug(e.loc);
    if (!slug || seen.has(slug)) continue;
    seen.add(slug);
    const have = normalizeCompanyName(slug.replace(/-/g, " "));
    if (have.length < 3) continue;
    const exact = have === want;
    const prefix = !exact && (have.startsWith(want) || want.startsWith(have));
    if (exact || prefix) out.push({ url: e.loc, slug, exact, gap: Math.abs(have.length - want.length) });
  }
  return out.sort((a, b) => Number(b.exact) - Number(a.exact) || a.gap - b.gap);
}

/** The single candidate worth fetching, or null when none or when the best prefix matches are tied (ambiguous). */
export function pickCandidate(cands: StartupCandidate[]): StartupCandidate | null {
  const [best, next] = cands;
  if (!best) return null;
  if (best.exact) return best;
  return next && !next.exact && next.gap === best.gap ? null : best;
}

export function parseStartupPage(html: string, pageUrl: string): PortfolioEntry | null {
  const $ = cheerio.load(html);
  const main = $("main").first();
  const companyName = clean(main.find("h1").first().text());
  if (!companyName) return null;
  const header = main.find("header").first();

  const sectors = header
    .find('a[href*="/sectors/"]')
    .map((_, a) => clean($(a).text()))
    .get()
    .filter(Boolean);
  const location = clean(header.find('a[href*="/startups/location:"]').first().closest("span").text()) || null;

  const richtext = main.find(".richtext").first().clone();
  richtext.find("br").replaceWith(" ");
  const description = clean(richtext.text()) || null;

  let website: string | null = null;
  main.find("ul li a").each((_, a) => {
    if (website || clean($(a).text()).toLowerCase() !== "website") return;
    const href = $(a).attr("href");
    if (href && /^https?:\/\//i.test(href)) website = href;
  });

  const yearText = main.find('a[href*="/startups/partnered:"]').first().attr("href")?.match(/partnered:(\d{4})/)?.[1];
  const status = clean(main.find('a[href*="/startups/status:"]').first().text()) || null;

  const founders: { name: string; role: string | null }[] = [];
  main.find("h2").each((_, h) => {
    if (clean($(h).text()).toLowerCase() !== "founders") return;
    $(h)
      .parent()
      .find("ul li")
      .each((__, li) => {
        const n = clean($(li).text());
        if (n) founders.push({ name: n, role: null });
      });
  });

  return {
    pageUrl: canonicalizeUrl(pageUrl),
    companyName,
    website,
    sector: sectors.length ? [...new Set(sectors)].join(" / ") : null,
    stage: null, // Blume's portfolio pages do not publish a funding stage
    partneredYear: yearText ? Number(yearText) : null,
    location,
    description,
    founders,
    coInvestors: [],
    rationale: [],
    status,
  };
}

async function findEntry(ctx: SiteContext, q: { name: string; domain: string | null }): Promise<PortfolioEntry | null> {
  const entries = await readSitemap(ctx, SITEMAP_INDEX, { onlyChild: /sitemap-startups-\d+\.xml$/, maxChildren: 4 });
  const cand = pickCandidate(matchStartups(entries, q.name));
  if (!cand) return null; // a miss costs no detail fetch
  const page = await ctx.fetch(cand.url);
  if (page.status !== 200) return null;
  const entry = parseStartupPage(page.text, cand.url);
  if (!entry) return null;

  const want = normalizeCompanyName(q.name);
  const got = normalizeCompanyName(entry.companyName);
  const nameOk = got === want || got.startsWith(want) || want.startsWith(got);
  const siteDomain = domainFromUrl(entry.website);
  const domainMatches = !!q.domain && !!siteDomain && (siteDomain === q.domain || siteDomain.endsWith(`.${q.domain}`) || q.domain.endsWith(`.${siteDomain}`));
  // A near-name match whose website is a different domain is another company; an exact name is kept (Blume sometimes lists a parent's site).
  if (!cand.exact && q.domain && siteDomain && !domainMatches) return null;
  if (!cand.exact && !domainMatches && Math.min(want.length, got.length) < 5) return null; // too short a prefix to trust unconfirmed
  return nameOk ? entry : null;
}

export const blume: InvestorSite = {
  key: "blume_ventures",
  name: "Blume Ventures",
  baseUrl: BASE,
  roles: ["discovery", "enrichment"],
  discover,
  findEntry,
};
