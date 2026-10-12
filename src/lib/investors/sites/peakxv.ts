import * as cheerio from "cheerio";
import { domainFromUrl, errorMessage, normalizeCompanyName, stripHtml, truncate } from "@/lib/util/text";
import { meta, normalizeStage, parseAmount, readSitemap, withinDays } from "../html";
import { emptySignal, type DiscoverySignal, type InvestorSite, type PortfolioEntry, type SiteContext } from "../types";

/**
 * Peak XV Partners (peakxv.com, a Webflow site).
 *
 * Enrichment: /companies/<slug> pages carry website, sector, partnered year, current stage, region, founders.
 * Slugs come from the sitemap, so a miss costs no page fetch.
 *
 * Discovery is deliberately selective: the sitemap's <lastmod> is bulk-updated and says nothing about publish
 * dates, and /announcement/ posts are programme/fund news (Surge, Spark). The /insights index page, however,
 * lists every post with its type and real publish date, so we use that to pick in-window posts and then read
 * the opening paragraphs to confirm it is a first-person investment announcement.
 */
const BASE = "https://www.peakxv.com";
const SITEMAP = `${BASE}/sitemap.xml`;
const INDEX = `${BASE}/insights`;
const NAME = "Peak XV Partners";

// ---------- helpers ----------

const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];

/** "August 12, 2026" → UTC midnight; null for anything else. */
export function parseLongDate(text: string | null | undefined): Date | null {
  const m = text?.trim().match(/^([A-Za-z]+)\s+(\d{1,2}),\s*(\d{4})$/);
  if (!m) return null;
  const month = MONTHS.indexOf(m[1].toLowerCase());
  if (month < 0) return null;
  const d = new Date(Date.UTC(Number(m[3]), month, Number(m[2])));
  return d.getUTCMonth() === month ? d : null;
}

const clean = (s: string | undefined | null) => (s ? stripHtml(s).replace(/\s+/g, " ").trim() : "");

const hostOf = (url: string | null | undefined) => domainFromUrl(url)?.replace(/^www\./, "") ?? null;
const sameSite = (a: string, b: string) => a === b || a.endsWith(`.${b}`) || b.endsWith(`.${a}`);

/** The brand label of a domain: "app.aampe.co.in" → "aampe". Heuristic; only used to propose candidates. */
export function domainLabel(domain: string | null | undefined): string | null {
  const host = hostOf(domain?.includes("/") ? domain : domain ? `https://${domain}` : null);
  if (!host) return null;
  const labels = host.split(".");
  if (labels.length < 2) return null;
  labels.pop();
  if (labels.length > 1 && ["co", "com", "org", "net", "gov", "ac"].includes(labels[labels.length - 1])) labels.pop();
  return labels[labels.length - 1] || null;
}

// ---------- sitemap ----------

export interface PeakCompanyRef {
  slug: string;
  url: string;
}

export function companyRefsFromUrls(urls: string[]): PeakCompanyRef[] {
  const out: PeakCompanyRef[] = [];
  for (const url of urls) {
    const m = url.match(/^https?:\/\/(?:www\.)?peakxv\.com\/companies\/([a-z0-9][a-z0-9-]*)\/?$/i);
    if (m) out.push({ slug: m[1].toLowerCase(), url: `${BASE}/companies/${m[1].toLowerCase()}` });
  }
  return out;
}

const slugKey = (slug: string) => normalizeCompanyName(slug.replace(/-/g, " "));

/** Slugs plausibly naming this company: by normalised name, or by the brand label of its domain. No fetching. */
export function matchSlugs(refs: PeakCompanyRef[], q: { name: string; domain: string | null }): PeakCompanyRef[] {
  const nameKey = normalizeCompanyName(q.name);
  const label = domainLabel(q.domain);
  const labelKey = label ? normalizeCompanyName(label) : null;
  const scored = new Map<string, { ref: PeakCompanyRef; score: number }>();
  for (const ref of refs) {
    const key = slugKey(ref.slug);
    const compact = ref.slug.replace(/-/g, "");
    let score = 0;
    if (nameKey && (key === nameKey || compact === nameKey)) score += 2;
    if (labelKey && (key === labelKey || compact === labelKey)) score += 1;
    if (score) scored.set(ref.slug, { ref, score });
  }
  return [...scored.values()].sort((a, b) => b.score - a.score).map((s) => s.ref);
}

// ---------- company page ----------

/** Parse /companies/<slug>. Returns null unless a company name and the "client-info" block are present. */
export function parseCompanyPage(html: string, pageUrl: string): PortfolioEntry | null {
  try {
    const $ = cheerio.load(html);
    const root = $(".section_client-info").first();
    if (!root.length) return null;
    const name =
      clean(root.find("h1").first().text()) ||
      clean(meta(html, "og:title")?.split("|")[0]) ||
      "";
    if (!name) return null;

    const items = new Map<string, cheerio.Cheerio<any>>();
    root.find(".client-info_meta-item").each((_, el) => {
      const label = clean($(el).children(".text-style-tagline").first().text()).toLowerCase();
      if (label && !items.has(label)) items.set(label, $(el));
    });
    const listTexts = (label: string): string[] => {
      const el = items.get(label);
      if (!el) return [];
      const rows = el.find(".w-dyn-item");
      const out = rows.length ? rows.map((_, r) => clean($(r).text()).replace(/;\s*$/, "")).get() : [clean(el.children().not(".text-style-tagline").text())];
      return [...new Set(out.filter(Boolean))];
    };
    const plain = (label: string) => clean(items.get(label)?.children().not(".text-style-tagline").text()) || null;

    const websiteHref = items.get("website")?.find("a[href]").first().attr("href") ?? null;
    const website = websiteHref && /^https?:\/\//i.test(websiteHref) ? websiteHref : null;
    const partnered = plain("partnered")?.match(/^(\d{4})$/)?.[1];
    const currentStage = plain("current stage");
    const sectors = listTexts("sector");
    const regions = listTexts("region");
    const description = clean(root.find(".client-info_content p").first().text()) || null;
    const founders = listTexts("founders").map((n) => ({ name: n, role: null as string | null }));

    return {
      pageUrl,
      companyName: name,
      website,
      sector: sectors.length ? sectors.join(", ") : null,
      stage: normalizeStage(currentStage),
      partneredYear: partnered ? Number(partnered) : null,
      location: regions.length ? regions.join(", ") : null,
      description,
      founders,
      coInvestors: [],
      rationale: [],
      status: currentStage,
    };
  } catch {
    return null;
  }
}

/** Accept a parsed page only when it is the company asked for (name, or website domain, without a domain clash). */
export function pageMatches(entry: PortfolioEntry, q: { name: string; domain: string | null }): boolean {
  const nameOk = normalizeCompanyName(entry.companyName) === normalizeCompanyName(q.name);
  const pageHost = hostOf(entry.website);
  const wantHost = hostOf(q.domain?.includes("/") ? q.domain : q.domain ? `https://${q.domain}` : null);
  const domainKnown = !!pageHost && !!wantHost;
  const domainOk = domainKnown && sameSite(pageHost!, wantHost!);
  if (domainKnown && !domainOk) return false;
  return nameOk || domainOk;
}

// ---------- insights index + posts ----------

export interface PeakIndexItem {
  url: string;
  title: string;
  kind: string;
  publishedAt: Date | null;
}

/** Items of the /insights index: href, title, post type ("Blog", "Newsletter", "News", "Video"…) and date. */
export function parseInsightsIndex(html: string): PeakIndexItem[] {
  try {
    const $ = cheerio.load(html);
    const out: PeakIndexItem[] = [];
    const seen = new Set<string>();
    $(".insights_item").each((_, el) => {
      const href = $(el).find("a[href]").first().attr("href");
      if (!href || !/^\/(insight|announcement)\/[^/?#]+$/.test(href)) return;
      const url = `${BASE}${href}`;
      if (seen.has(url)) return;
      const title = clean($(el).find(".resource_heading").first().text());
      if (!title) return;
      const cells = $(el).find(".insights_hidden-filters > div").map((_, d) => clean($(d).text())).get();
      seen.add(url);
      out.push({ url, title, kind: cells[0] ?? "", publishedAt: parseLongDate(cells[1]) });
    });
    return out;
  } catch {
    return [];
  }
}

export interface PeakPost {
  title: string;
  publishedAt: Date | null;
  description: string | null;
  /** First paragraphs of the body, plain text. */
  lead: string[];
}

export function parsePostPage(html: string): PeakPost | null {
  try {
    const $ = cheerio.load(html);
    const title = clean($(".blog-post-header3_title-wrapper h1").first().text()) || clean($("h1").first().text());
    if (!title) return null;
    const dateText = clean($(".blog-post-header3_date-wrapper .text-size-small").first().text());
    const lead = $(".blog-post-content_rct p")
      .slice(0, 4)
      .map((_, p) => clean($(p).text()))
      .get()
      .filter(Boolean);
    return { title, publishedAt: parseLongDate(dateText), description: meta(html, "description"), lead };
  } catch {
    return null;
  }
}

const TITLE_NAME = /^(?:investing in|partnering with|backing|why we (?:invested in|backed)|our (?:journey|partnership) with)\s+(.+?)(?:\s*[:,–—|]\s|\s+-\s|$)/i;
const INVEST_VERB = /\b(?:lead(?:ing)?|led|co-led|back(?:ing|ed)?|invest(?:ing|ed)?|partner(?:ing|ed)?|announc\w+)\b/i;
const ROUND = /\b(?:series\s+[a-e]|seed|pre-seed|round|financing)\b/i;
const FIRST_PERSON = /\b(?:we|we're|we’re|our)\b|\blead investor\b/i;

/** The sentence (from the opening paragraphs) that states Peak XV is backing the company, or null. */
export function investmentSentence(lead: string[]): string | null {
  for (const para of lead) {
    for (const s of para.split(/(?<=[.!?])\s+/)) {
      if (FIRST_PERSON.test(s) && INVEST_VERB.test(s) && ROUND.test(s)) return s;
    }
  }
  return null;
}

/** Company name from the headline: explicit "Investing in X" patterns, or a leading "X:" that is a known portfolio slug. */
export function companyFromTitle(title: string, slugs: Set<string> | null): string | null {
  const m = title.match(TITLE_NAME);
  if (m) return m[1].trim().replace(/[’']s$/, "") || null;
  const head = title.split(/\s*[:–—|]\s+/)[0]?.trim();
  if (head && head !== title && head.split(/\s+/).length <= 4 && slugs?.has(normalizeCompanyName(head))) return head;
  return null;
}

/** Build a signal from a post, or null when it isn't an investment announcement / has no usable date / names no company. */
export function signalFromPost(post: PeakPost, url: string, fallbackDate: Date | null, slugs: Set<string> | null): DiscoverySignal | null {
  const publishedAt = post.publishedAt ?? fallbackDate;
  if (!publishedAt) return null;
  const titled = TITLE_NAME.test(post.title);
  const sentence = investmentSentence(post.lead);
  if (!titled && !sentence) return null;
  // A signal without an identifiable portfolio company (e.g. a fund-close post) is of no use downstream.
  const companyName = companyFromTitle(post.title, slugs);
  if (!companyName) return null;
  const amount = sentence ? parseAmount(sentence) : null;
  return emptySignal(
    { name: NAME },
    {
      signalType: /^why we\b/i.test(post.title) ? "why_we_invested" : "investment_announcement",
      sourceUrl: url,
      headline: post.title,
      summary: post.description ? truncate(post.description, 300) : null,
      publishedAt,
      companyName,
      stage: sentence ? normalizeStage(sentence) : null,
      fundingAmount: amount?.amount ?? null,
      fundingCurrency: amount?.currency ?? null,
    },
  );
}

// ---------- the site ----------

async function companySlugKeys(ctx: SiteContext): Promise<Set<string> | null> {
  try {
    const refs = companyRefsFromUrls((await readSitemap(ctx, SITEMAP)).map((e) => e.loc));
    return new Set(refs.map((r) => slugKey(r.slug)));
  } catch {
    return null;
  }
}

export const peakxv: InvestorSite = {
  key: "peak_xv",
  name: NAME,
  baseUrl: BASE,
  roles: ["enrichment", "verification", "discovery"],

  async discover(ctx) {
    const index = await ctx.fetch(INDEX);
    if (index.status !== 200) throw new Error(`Peak XV insights index returned HTTP ${index.status}`);
    const items = parseInsightsIndex(index.text);
    if (!items.length) {
      ctx.note("Peak XV insights index parsed to zero posts (layout may have changed)");
      return [];
    }
    // Only dated, in-window, unseen posts of a type that can be an announcement; newest first.
    const candidates = items
      .filter((i) => /^(blog|news)$/i.test(i.kind) && i.publishedAt && withinDays(i.publishedAt, ctx.now, ctx.windowDays) && !ctx.isKnownUrl(i.url))
      .sort((a, b) => b.publishedAt!.getTime() - a.publishedAt!.getTime())
      .slice(0, ctx.maxPages);
    if (!candidates.length) return [];

    let slugs: Set<string> | null | undefined;
    const out: DiscoverySignal[] = [];
    for (const c of candidates) {
      try {
        const page = await ctx.fetch(c.url);
        if (page.status !== 200) continue;
        const post = parsePostPage(page.text);
        if (!post || !withinDays(post.publishedAt ?? c.publishedAt, ctx.now, ctx.windowDays)) continue;
        if (slugs === undefined && !TITLE_NAME.test(post.title)) slugs = await companySlugKeys(ctx);
        const signal = signalFromPost(post, c.url, c.publishedAt, slugs ?? null);
        if (signal) out.push(signal);
      } catch (err) {
        ctx.note(`Peak XV post ${c.url}: ${errorMessage(err)}`);
      }
    }
    return out;
  },

  async findEntry(ctx, q) {
    const refs = companyRefsFromUrls((await readSitemap(ctx, SITEMAP)).map((e) => e.loc));
    const candidates = matchSlugs(refs, q).slice(0, 2);
    for (const c of candidates) {
      const page = await ctx.fetch(c.url);
      if (page.status !== 200) continue;
      const entry = parseCompanyPage(page.text, c.url);
      if (entry && pageMatches(entry, q)) return entry;
    }
    return null;
  },
};
