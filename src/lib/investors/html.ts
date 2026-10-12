import * as cheerio from "cheerio";
import { XMLParser } from "fast-xml-parser";
import { stripHtml } from "@/lib/util/text";
import type { FetchedPage, SiteContext } from "./types";

/** Every JSON-LD object on the page, flattened (arrays and @graph unwrapped). Malformed blocks are skipped. */
export function jsonLd(html: string): Record<string, unknown>[] {
  const $ = cheerio.load(html);
  const out: Record<string, unknown>[] = [];
  const push = (v: unknown) => {
    if (Array.isArray(v)) v.forEach(push);
    else if (v && typeof v === "object") {
      const o = v as Record<string, unknown>;
      out.push(o);
      if (o["@graph"]) push(o["@graph"]);
    }
  };
  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      push(JSON.parse($(el).contents().text()));
    } catch {
      /* ignore a broken block */
    }
  });
  return out;
}

export const ldOfType = (html: string, ...types: string[]) => jsonLd(html).find((o) => types.includes(String(o["@type"])));

export function meta(html: string, name: string): string | null {
  const $ = cheerio.load(html);
  const v = $(`meta[property="${name}"], meta[name="${name}"]`).first().attr("content");
  return v ? stripHtml(v).trim() || null : null;
}

/** Next.js sites embed their page data as JSON; prefer it over scraping the markup. */
export function nextData(html: string): Record<string, unknown> | null {
  const m = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (!m) return null;
  try {
    return JSON.parse(m[1]) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export function toDate(v: unknown): Date | null {
  if (typeof v !== "string" && typeof v !== "number") return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

export const visibleText = (html: string): string => {
  const $ = cheerio.load(html);
  $("script, style, noscript, nav, footer, header, svg").remove();
  return $("body").text().replace(/\s+/g, " ").trim();
};

export const withinDays = (d: Date | null, now: Date, days: number) => !d || now.getTime() - d.getTime() <= days * 86_400_000;

const xml = new XMLParser({ ignoreAttributes: false, trimValues: true, isArray: (n) => n === "url" || n === "sitemap" });
export interface SitemapEntry {
  loc: string;
  lastmod: Date | null;
}

/** URLs in a sitemap, following one level of <sitemapindex>. `onlyChild` narrows which child sitemaps are opened. */
export async function readSitemap(ctx: SiteContext, url: string, opts: { onlyChild?: RegExp; maxChildren?: number } = {}): Promise<SitemapEntry[]> {
  const page: FetchedPage = await ctx.fetch(url);
  if (page.status !== 200) throw new Error(`sitemap ${url} returned HTTP ${page.status}`);
  const doc = xml.parse(page.text);
  const entries = (list: unknown): SitemapEntry[] =>
    (Array.isArray(list) ? list : []).flatMap((u: Record<string, unknown>) => (typeof u.loc === "string" ? [{ loc: u.loc.trim(), lastmod: toDate(u.lastmod) }] : []));
  if (doc?.urlset?.url) return entries(doc.urlset.url);
  if (doc?.sitemapindex?.sitemap) {
    const children = entries(doc.sitemapindex.sitemap).filter((c) => !opts.onlyChild || opts.onlyChild.test(c.loc)).slice(0, opts.maxChildren ?? 6);
    const out: SitemapEntry[] = [];
    for (const c of children) out.push(...(await readSitemap(ctx, c.loc)));
    return out;
  }
  throw new Error(`sitemap ${url} parsed but contained no urls`);
}

/** "₹10 Cr" / "$3 million" / "Rs 5 crore" → amount in major units, or null. */
export function parseAmount(text: string): { amount: number; currency: string } | null {
  const m = text.match(/(₹|rs\.?|inr|\$|usd)\s?([\d,.]+)\s?(crore|cr|lakh|million|mn|m|billion|bn|k)?\b/i);
  if (!m) return null;
  const n = Number(m[2].replace(/,/g, ""));
  if (!Number.isFinite(n)) return null;
  const unit = (m[3] ?? "").toLowerCase();
  const mult = unit === "crore" || unit === "cr" ? 1e7 : unit === "lakh" ? 1e5 : unit === "million" || unit === "mn" || unit === "m" ? 1e6 : unit === "billion" || unit === "bn" ? 1e9 : unit === "k" ? 1e3 : 1;
  return { amount: n * mult, currency: /\$|usd/i.test(m[1]) ? "USD" : "INR" };
}

const STAGES: [RegExp, string][] = [
  [/pre[-\s]?seed/i, "pre-seed"],
  [/pre[-\s]?series[-\s]?a/i, "pre-series-a"],
  [/\bseed\b/i, "seed"],
  [/series[-\s]?a\b/i, "series-a"],
  [/series[-\s]?b\b/i, "series-b"],
  [/series[-\s]?[c-z]\b/i, "series-c-plus"],
];
/** Normalise stage wording to the pipeline's stage vocabulary; null when not recognisable. */
export function normalizeStage(text: string | null | undefined): string | null {
  if (!text) return null;
  return STAGES.find(([re]) => re.test(text))?.[1] ?? null;
}
