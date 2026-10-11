import { XMLParser } from "fast-xml-parser";
import { safeFetch } from "@/lib/net/safe-fetch";
import { stripHtml, truncate } from "@/lib/util/text";
import type { FundingSourceAdapter, RawArticle } from "./types";

const parser = new XMLParser({
  ignoreAttributes: false,
  trimValues: true,
  isArray: (name) => name === "item" || name === "url" || name === "entry",
});

function text(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "string" || typeof v === "number") return String(v);
  if (typeof v === "object" && "#text" in (v as Record<string, unknown>)) return String((v as Record<string, unknown>)["#text"]);
  return "";
}

function parseDate(v: unknown): Date | null {
  const s = text(v);
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Generic RSS 2.0 adapter — used by ET Entrepreneur, Inc42 and YourStory. */
export class RssAdapter implements FundingSourceAdapter {
  constructor(
    readonly key: string,
    private readonly feedUrl: string,
  ) {}

  async fetchLatest(): Promise<RawArticle[]> {
    const res = await safeFetch(this.feedUrl, { accept: "application/rss+xml,application/xml,text/xml;q=0.9,*/*;q=0.5" });
    if (res.status !== 200) throw new Error(`${this.key}: feed returned HTTP ${res.status}`);
    const doc = parser.parse(res.text);
    const items: Record<string, unknown>[] = doc?.rss?.channel?.item ?? [];
    if (!Array.isArray(items) || items.length === 0) throw new Error(`${this.key}: feed parsed but contained no items`);
    const out: RawArticle[] = [];
    for (const item of items) {
      const headline = stripHtml(text(item.title));
      const link = text(item.link) || text(item.guid);
      if (!headline || !/^https?:\/\//i.test(link)) continue;
      const description = stripHtml(text(item.description));
      const encoded = stripHtml(text(item["content:encoded"]));
      out.push({
        sourceUrl: link,
        headline,
        snippet: description ? truncate(description, 800) : null,
        contentText: encoded ? truncate(encoded, 8000) : null,
        publishedAt: parseDate(item.pubDate) ?? parseDate(item["dc:date"]),
      });
    }
    return out;
  }
}

/**
 * Google-News-style sitemap adapter (<news:news> entries with publication_date).
 * Used for Entrackr, which has no RSS feed but whose robots.txt allows its news sitemap.
 */
export class NewsSitemapAdapter implements FundingSourceAdapter {
  constructor(
    readonly key: string,
    private readonly sitemapUrl: string,
  ) {}

  async fetchLatest(): Promise<RawArticle[]> {
    const res = await safeFetch(this.sitemapUrl, { accept: "application/xml,text/xml;q=0.9,*/*;q=0.5" });
    if (res.status !== 200) throw new Error(`${this.key}: sitemap returned HTTP ${res.status}`);
    const doc = parser.parse(res.text);
    const urls: Record<string, unknown>[] = doc?.urlset?.url ?? [];
    if (!Array.isArray(urls) || urls.length === 0) throw new Error(`${this.key}: sitemap parsed but contained no urls`);
    const out: RawArticle[] = [];
    for (const u of urls) {
      const news = u["news:news"] as Record<string, unknown> | undefined;
      const loc = text(u.loc);
      const headline = stripHtml(text(news?.["news:title"]));
      if (!news || !headline || !/^https?:\/\//i.test(loc)) continue;
      const keywords = text(news["news:keywords"]);
      out.push({
        sourceUrl: loc,
        headline,
        snippet: keywords ? `Keywords: ${keywords}` : null,
        contentText: null,
        publishedAt: parseDate(news["news:publication_date"]) ?? parseDate(u.lastmod),
      });
    }
    return out;
  }
}
