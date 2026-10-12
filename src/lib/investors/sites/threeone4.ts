import * as cheerio from "cheerio";
import { canonicalizeUrl, domainFromUrl, normalizeCompanyName, stripHtml, truncate } from "@/lib/util/text";
import { normalizeStage, parseAmount, readSitemap, withinDays } from "../html";
import { emptySignal, type DiscoverySignal, type InvestorSite, type PortfolioEntry, type SiteContext } from "../types";

const BASE = "https://www.3one4capital.com";
const SITEMAP = `${BASE}/sitemap.xml`;
const BLOG_INDEX = `${BASE}/blog`;
const PORTFOLIO_PREFIX = `${BASE}/portfolio-companies/`;

const clean = (s: string | undefined | null) => (s ? s.replace(/[\s​-‍⁠﻿]+/g, " ").trim() : "");

/* ------------------------------------------------------------------ portfolio pages (enrichment) */

/** Slugs of /portfolio-companies/<slug> pages in a sitemap's URL list. */
export function portfolioSlugs(urls: string[]): string[] {
  const out: string[] = [];
  for (const u of urls) {
    const m = u.trim().match(/\/portfolio-companies\/([a-z0-9][a-z0-9-]*)\/?$/i);
    if (m) out.push(m[1].toLowerCase());
  }
  return [...new Set(out)];
}

/** Webflow variant slugs ("lumio-2") and placeholder pages ("undisclosed-4") are not usable names. */
const slugName = (slug: string) => slug.replace(/-\d+$/, "").replace(/-/g, " ");

/**
 * Slugs that plausibly are this company. Exact normalised match always counts; a slug that is a whole-word prefix of
 * the name ("eka care" for "Eka Care Technologies") counts only when it is distinctive (>= 5 chars) and the caller
 * has a domain to confirm it afterwards (`needsDomain`).
 */
export function matchSlugs(slugs: string[], name: string): { slug: string; needsDomain: boolean }[] {
  const target = normalizeCompanyName(name);
  if (!target) return [];
  const nameWords = name.toLowerCase().normalize("NFKD").replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter(Boolean);
  const out: { slug: string; needsDomain: boolean }[] = [];
  for (const slug of slugs) {
    if (/^undisclosed/.test(slug)) continue;
    const sn = slugName(slug);
    const norm = normalizeCompanyName(sn);
    if (!norm) continue;
    if (norm === target) {
      out.push({ slug, needsDomain: false });
      continue;
    }
    const slugWords = sn.split(" ");
    const prefix = nameWords.slice(0, slugWords.length).join("");
    if (norm.length >= 5 && nameWords.length > slugWords.length && prefix === slugWords.join("")) out.push({ slug, needsDomain: true });
  }
  // Prefer the un-numbered slug of a variant pair.
  return out.sort((a, b) => Number(/-\d+$/.test(a.slug)) - Number(/-\d+$/.test(b.slug)));
}

/** Parse one /portfolio-companies/<slug> page (Webflow CMS markup). Returns null when it isn't such a page. */
export function parsePortfolioPage(html: string, pageUrl: string): PortfolioEntry | null {
  try {
    const $ = cheerio.load(html);
    const root = $(".portfolio-inner-wrapper").first();
    if (!root.length) return null;
    const name = clean(root.find("h1").first().text());
    if (!name) return null;

    const sector = clean(root.find(".orange-heading-text").first().text()) || null;
    const exitedTag = root.find(".exited-tag.inside-tag").first();
    const exited = exitedTag.length > 0 && !exitedTag.hasClass("w-condition-invisible");

    let website: string | null = null;
    root.find(".pc-social-share-container a[href]").each((_, a) => {
      if (website) return;
      const href = $(a).attr("href") ?? "";
      // The first share-link is the company website; the rest are social profiles.
      if (/^https?:\/\//i.test(href) && !/(twitter|x|facebook|linkedin|instagram|youtube)\.com/i.test(href) && !$(a).hasClass("w-condition-invisible")) website = href;
    });

    const listBy = (headRe: RegExp): string[] => {
      const block = root.find(".pc-detail-block").filter((_, el) => headRe.test(clean($(el).find(".pc-detail-head").first().text())));
      return block
        .first()
        .find(".w-dyn-item .pc-funding-detail-text")
        .map((_, el) => clean($(el).text()))
        .get()
        .filter(Boolean);
    };

    const description = clean(root.find(".pc-description").first().text()) || null;
    return {
      pageUrl,
      companyName: name,
      website,
      sector,
      stage: null, // the page publishes no round/stage
      partneredYear: null,
      location: null,
      description: description ? truncate(description, 600) : null,
      founders: listBy(/^founders?$/i).map((n) => ({ name: n, role: null })),
      coInvestors: listBy(/^co-?investors?$/i),
      rationale: [],
      status: exited ? "exited" : "portfolio",
    };
  } catch {
    return null;
  }
}

export async function findEntry(ctx: SiteContext, q: { name: string; domain: string | null }): Promise<PortfolioEntry | null> {
  let urls: string[];
  try {
    urls = (await readSitemap(ctx, SITEMAP)).map((e) => e.loc);
  } catch (err) {
    ctx.note(`3one4 sitemap unavailable: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
  const candidates = matchSlugs(portfolioSlugs(urls), q.name);
  const queryDomain = q.domain ? domainFromUrl(q.domain) ?? q.domain.toLowerCase().replace(/^www\./, "") : null;
  for (const c of candidates.slice(0, 1)) {
    if (c.needsDomain && !queryDomain) continue; // a partial name match with nothing to confirm it: don't even fetch
    const url = `${PORTFOLIO_PREFIX}${c.slug}`;
    const page = await ctx.fetch(url);
    if (page.status !== 200) return null;
    const entry = parsePortfolioPage(page.text, url);
    if (!entry) return null;
    const entryDomain = domainFromUrl(entry.website);
    if (queryDomain && entryDomain && entryDomain !== queryDomain) return null; // same name, different company
    if (c.needsDomain && entryDomain !== queryDomain) return null;
    return entry;
  }
  return null;
}

/* ------------------------------------------------------------------ blog announcements (discovery) */

export interface BlogCard {
  url: string;
  title: string;
  publishedAt: Date | null;
}

const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];

/** "October 9, 2026" → that day at 00:00 UTC. */
export function parseCardDate(text: string): Date | null {
  const m = clean(text).match(/^([A-Za-z]+)\s+(\d{1,2}),\s*(\d{4})$/);
  if (!m) return null;
  const mi = MONTHS.indexOf(m[1].toLowerCase());
  return mi < 0 ? null : new Date(Date.UTC(Number(m[3]), mi, Number(m[2])));
}

/** Cards from the /blog index (newest first, one page of ~100). */
export function parseBlogIndex(html: string): BlogCard[] {
  try {
    const $ = cheerio.load(html);
    const out: BlogCard[] = [];
    const seen = new Set<string>();
    $("a.blog-card[href^='/blogs/']").each((_, a) => {
      const href = $(a).attr("href") ?? "";
      const url = `${BASE}${href.split(/[?#]/)[0]}`;
      const title = clean($(a).find("h5").first().text());
      if (!title || seen.has(url)) return;
      seen.add(url);
      out.push({ url, title, publishedAt: parseCardDate($(a).find(".calendar-icon").first().text()) });
    });
    return out;
  } catch {
    return [];
  }
}

const FUNDING_VERB = /\b(raises?|raised|secures?|secured|closes|closed|announces? .{0,30}(round|funding)|backs|backed|leads|led|co-?leads?)\b/i;
const FUNDING_NOUN = /\b(series [a-z]\b|seed|pre-series|funding|financing|round|\$\s?[\d.,]+|₹\s?[\d.,]+|inr\s?[\d.,]+|usd\s?[\d.,]+|million|crore)/i;
/** Fund-level news, exits and thought-leadership that merely contain funding words. */
const NOT_INVESTMENT = /\b(exit|exits|irr|dpi|fund [iv]+\b|(its|our|the) (first|second|third|fourth|fifth|\w+) fund|ranked|award|awards|named|recogni[sz]ed|report|budget|summit|podcast|webinar|roundtable|reappointed|elevates|promotes?|joins?|launch(es)?)\b/i;

/** True only for a post whose headline announces a funding round or 3one4 backing a company. */
export function isInvestmentTitle(title: string): boolean {
  return FUNDING_VERB.test(title) && FUNDING_NOUN.test(title) && !NOT_INVESTMENT.test(title);
}

const VERBS = "raises|raised|secures|secured|closes|closed|announces|bags|gets";

/** Company named in "…Gravity Secures $15 Million" / "3one4 Capital Backs Zerocircle: …". Null when not clear. */
export function companyFromTitle(title: string): string | null {
  const backs = title.match(/3one4 Capital (?:backs|backed|leads|doubles down on)\s+([^:.,–—-]{2,40}?)(?:\s*[:.,–—]|\s+(?:as|in|with|to)\b|$)/i);
  if (backs) return validName(backs[1]);
  // Headlines are often "<tagline>. <Company> Raises …" or "<tagline>: <Company> Secures …": look per segment.
  const segments = title.split(/(?<=[.:])\s+/).map((s) => s.replace(/[.:]$/, ""));
  for (const seg of segments) {
    const m = seg.match(new RegExp(`^(.{2,40}?)\\s+(?:${VERBS})\\b`, "i"));
    if (m) return validName(m[1]);
  }
  return null;
}

function validName(raw: string): string | null {
  const n = clean(raw.replace(/^[‍\s]+/, ""));
  const words = n.split(" ");
  if (!n || words.length > 4) return null;
  if (/^(we|it|this|that|india|indian|the (company|startup)|3one4)/i.test(n)) return null;
  return n;
}

export interface BlogPost {
  summary: string | null;
  mentions3one4: boolean;
  publishedAt: Date | null;
}

/** Facts from a blog detail page: body mentions us, first key-takeaway as a summary, visible date. */
export function parseBlogPost(html: string): BlogPost | null {
  try {
    const $ = cheerio.load(html);
    const body = $(".resource-rich-text-block").first();
    if (!body.length) return null;
    const text = clean(body.text());
    const first = clean(body.find("li").first().text()) || clean(body.find("p").first().text());
    return {
      mentions3one4: /3one4/i.test(text),
      summary: first ? truncate(stripHtml(first), 280) : null,
      publishedAt: parseCardDate($(".resrouce-inner-data-row .calendar-icon, .resource-date-container .calendar-icon").first().text()),
    };
  } catch {
    return null;
  }
}

export function signalFromPost(card: BlogCard, post: BlogPost): DiscoverySignal {
  const amt = parseAmount(card.title);
  const backing = /3one4 Capital (backs|backed|leads|doubles)/i.test(card.title);
  return emptySignal(site, {
    signalType: backing ? "investment_announcement" : "portfolio_funding_news",
    sourceUrl: card.url,
    headline: card.title,
    summary: post.summary,
    publishedAt: card.publishedAt ?? post.publishedAt,
    companyName: companyFromTitle(card.title),
    stage: normalizeStage(card.title) ?? null,
    fundingAmount: amt?.amount ?? null,
    fundingCurrency: amt?.currency ?? null,
  });
}

export async function discover(ctx: SiteContext): Promise<DiscoverySignal[]> {
  const index = await ctx.fetch(BLOG_INDEX);
  if (index.status !== 200) {
    ctx.note(`3one4 blog index returned HTTP ${index.status}`);
    return [];
  }
  const cards = parseBlogIndex(index.text).filter(
    (c) => c.publishedAt && withinDays(c.publishedAt, ctx.now, ctx.windowDays) && isInvestmentTitle(c.title) && !ctx.isKnownUrl(canonicalizeUrl(c.url)) && !ctx.isKnownUrl(c.url),
  );
  const out: DiscoverySignal[] = [];
  for (const card of cards.slice(0, ctx.maxPages)) {
    try {
      const page = await ctx.fetch(card.url);
      if (page.status !== 200) continue;
      const post = parseBlogPost(page.text);
      if (!post || !post.mentions3one4) continue;
      out.push(signalFromPost(card, post));
    } catch (err) {
      ctx.note(`3one4 post ${card.url}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  return out;
}

export const threeone4: InvestorSite = {
  key: "three_one_four",
  name: "3one4 Capital",
  baseUrl: BASE,
  roles: ["discovery", "enrichment", "verification"],
  discover,
  findEntry,
};

const site = threeone4;
