import { domainFromUrl, normalizeCompanyName, truncate } from "@/lib/util/text";
import { nextData, normalizeStage, readSitemap, toDate, withinDays } from "../html";
import { emptySignal, type DiscoverySignal, type InvestorSite, type PortfolioEntry, type SiteContext } from "../types";

const BASE = "https://elevationcapital.com";
const SITEMAP = `${BASE}/sitemap.xml`;
const POST_PREFIX = "investing-in-";

/**
 * Elevation Capital (Next.js + Sanity). Every page embeds `__NEXT_DATA__`; the document is at
 * `props.pageProps.data.page` and its `_type` tells pages apart even though sitemap URLs are flat (`/<slug>`):
 *   - `portfolioCompany`: company page (title, website, stageType, tags, short_description, founders[])
 *   - `post`: perspectives; investment announcements are `investing-in-<slug>` posts filed under the
 *     `portfolio-blog` parent, carrying `post_date`, `tag[]`, `preview_snippet`.
 * The sitemap has no <lastmod> and the blog index is client-rendered, so recency is only knowable per post.
 */

type Json = Record<string, unknown>;
const obj = (v: unknown): Json | null => (v && typeof v === "object" && !Array.isArray(v) ? (v as Json) : null);
const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

function pageDoc(html: string): Json | null {
  const data = obj(obj(obj(nextData(html)?.props)?.pageProps)?.data);
  return obj(data?.page);
}

const spanText = (block: unknown): string =>
  arr(obj(block)?.children)
    .map((c) => str(obj(c)?.text) ?? "")
    .join("")
    .trim();

export interface ElevationPost {
  slug: string;
  title: string;
  companyName: string | null;
  publishedAt: Date | null;
  snippet: string | null;
  sector: string | null;
  isPortfolioPost: boolean;
}

/** Parse an "Investing in X" post page. Null when the page is not a post. */
export function parseElevationPost(html: string): ElevationPost | null {
  try {
    const pg = pageDoc(html);
    if (!pg || pg._type !== "post") return null;
    const title = str(pg.title);
    const slug = str(pg.slug);
    if (!title || !slug) return null;
    const m = title.match(/^investing in\s+(.+)$/i);
    const parentSlug = str(obj(pg.parent)?.slug);
    return {
      slug,
      title,
      companyName: m ? m[1].trim() : null,
      publishedAt: toDate(pg.post_date),
      snippet: str(pg.preview_snippet),
      sector: str(obj(arr(pg.tag)[0])?.title),
      isPortfolioPost: parentSlug === "portfolio-blog",
    };
  } catch {
    return null;
  }
}

export interface ElevationCompany {
  slug: string;
  title: string;
  website: string | null;
  stage: string | null;
  sector: string | null;
  description: string | null;
  founders: string[];
}

/** Parse a portfolio company page. Null when the page is not a `portfolioCompany`. */
export function parseElevationCompany(html: string): ElevationCompany | null {
  try {
    const pg = pageDoc(html);
    if (!pg || pg._type !== "portfolioCompany") return null;
    const title = str(pg.title);
    const slug = str(pg.slug);
    if (!title || !slug) return null;
    const website = str(pg.website);
    const bio = str(spanText(arr(obj(pg.bio)?.text)[0]));
    return {
      slug,
      title,
      website: website && /^https?:\/\//i.test(website) ? website : null,
      stage: normalizeStage(str(obj(pg.stageType)?.title)),
      sector: str(obj(arr(pg.tags)[0])?.title),
      description: str(pg.short_description) ?? (bio ? truncate(bio, 300) : null),
      founders: arr(pg.founders).flatMap((f) => {
        const n = str(obj(f)?.title);
        return n ? [n] : [];
      }),
    };
  } catch {
    return null;
  }
}

/** Slugs of investment-announcement posts from the sitemap, de-duplicated, in sitemap order. */
export function postSlugsFromSitemap(urls: string[]): string[] {
  const seen = new Set<string>();
  for (const u of urls) {
    const slug = pathSlug(u);
    if (slug && slug.startsWith(POST_PREFIX) && slug.length > POST_PREFIX.length) seen.add(slug);
  }
  return [...seen];
}

function pathSlug(url: string): string | null {
  try {
    const p = new URL(url).pathname.replace(/^\/+|\/+$/g, "");
    return p && !p.includes("/") ? p : null;
  } catch {
    return null;
  }
}

/** Company-page candidates for a name: slugs whose words normalise to the same key as the name. */
export function companySlugCandidates(urls: string[], name: string): string[] {
  const key = normalizeCompanyName(name);
  if (key.length < 3) return [];
  const out = new Set<string>();
  for (const u of urls) {
    const slug = pathSlug(u);
    if (!slug || slug.startsWith(POST_PREFIX)) continue;
    if (normalizeCompanyName(slug.replace(/-/g, " ")) === key) out.add(slug);
  }
  return [...out];
}

/** Posts already seen to be outside the window, so repeated runs in one process move on to unseen posts. */
const staleUntil = new Map<string, number>();
const STALE_MS = 7 * 86_400_000;
export const resetElevationStaleMemo = () => staleUntil.clear();

async function discover(ctx: SiteContext): Promise<DiscoverySignal[]> {
  const urls = (await readSitemap(ctx, SITEMAP)).map((e) => e.loc);
  const out: DiscoverySignal[] = [];
  let fetched = 0;
  for (const slug of postSlugsFromSitemap(urls)) {
    if (fetched >= ctx.maxPages) break;
    const url = `${BASE}/${slug}`;
    if (ctx.isKnownUrl(url)) continue;
    if ((staleUntil.get(url) ?? 0) > ctx.now.getTime()) continue;
    fetched++;
    let page;
    try {
      page = await ctx.fetch(url);
    } catch (err) {
      ctx.note(`elevation: ${url}: ${err instanceof Error ? err.message : String(err)}`);
      continue;
    }
    if (page.status !== 200) continue;
    const post = parseElevationPost(page.text);
    if (!post || !post.isPortfolioPost || !post.companyName) {
      staleUntil.set(url, ctx.now.getTime() + STALE_MS);
      continue;
    }
    // No date means no recency cue: drop rather than let the pipeline treat an old memo as new.
    if (!post.publishedAt || !withinDays(post.publishedAt, ctx.now, ctx.windowDays)) {
      staleUntil.set(url, ctx.now.getTime() + STALE_MS);
      continue;
    }
    out.push(
      emptySignal(elevation, {
        signalType: "investment_announcement",
        sourceUrl: url,
        headline: post.title,
        summary: post.snippet,
        publishedAt: post.publishedAt,
        companyName: post.companyName,
        sector: post.sector,
      }),
    );
  }
  return out;
}

async function findEntry(ctx: SiteContext, q: { name: string; domain: string | null }): Promise<PortfolioEntry | null> {
  const urls = (await readSitemap(ctx, SITEMAP)).map((e) => e.loc);
  const candidates = companySlugCandidates(urls, q.name);
  // Ambiguous or absent: do not fetch anything.
  if (candidates.length !== 1) return null;
  const url = `${BASE}/${candidates[0]}`;
  const page = await ctx.fetch(url);
  if (page.status !== 200) return null;
  const c = parseElevationCompany(page.text);
  if (!c || normalizeCompanyName(c.title) !== normalizeCompanyName(q.name)) return null;
  const theirs = domainFromUrl(c.website);
  if (q.domain && theirs && domainFromUrl(q.domain) !== theirs) return null;
  return {
    pageUrl: url,
    companyName: c.title,
    website: c.website,
    sector: c.sector,
    stage: c.stage,
    partneredYear: null,
    location: null,
    description: c.description,
    founders: c.founders.map((name) => ({ name, role: null })),
    coInvestors: [],
    rationale: [],
    status: null,
  };
}

export const elevation: InvestorSite = {
  key: "elevation_capital",
  name: "Elevation Capital",
  roles: ["discovery", "enrichment"],
  baseUrl: BASE,
  discover,
  findEntry,
};
