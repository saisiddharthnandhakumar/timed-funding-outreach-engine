import * as cheerio from "cheerio";
import { safeFetch } from "@/lib/net/safe-fetch";
import { stripHtml, truncate } from "@/lib/util/text";
import type { FundingSourceAdapter, RawArticle } from "./types";

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const DAY_MS = 86_400_000;

/** "8 Oct 2026" → noon IST that day (the card only carries a calendar day, and it is the *updated* day). */
function cardDate(text: string): Date | null {
  const m = text.match(/(\d{1,2})\s+([A-Za-z]{3})[a-z]*\s+(\d{4})/);
  const mon = m ? MONTHS.indexOf(m[2].toLowerCase()) : -1;
  if (!m || mon < 0) return null;
  return new Date(Date.UTC(Number(m[3]), mon, Number(m[1]), 6, 30));
}

/** Mint article ids are "1" + the publish time in epoch milliseconds, which is the real first-publish time. */
function idDate(url: string): Date | null {
  const id = url.match(/-(\d{12,14})\.html/)?.[1];
  if (!id) return null;
  const ms = Number(id.length === 14 ? id.slice(1) : id);
  const d = new Date(ms);
  return d.getFullYear() >= 2015 && d.getFullYear() <= 2100 ? d : null;
}

/**
 * Parse Mint's start-ups listing page: JSON-LD ItemList (url, title, description) plus the article cards
 * (title, updated-day). Dates come from the article id when consistent with the card, else the card's day.
 */
export function parseMintListing(html: string, base = "https://www.livemint.com"): RawArticle[] {
  const $ = cheerio.load(html);
  const byUrl = new Map<string, { headline: string; description: string | null; day: Date | null }>();
  const abs = (u: string) => new URL(u, base).toString();

  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const j = JSON.parse($(el).contents().text());
      for (const o of Array.isArray(j) ? j : [j]) {
        if (o?.["@type"] !== "ItemList") continue;
        for (const it of o.itemListElement ?? []) {
          if (typeof it?.url === "string" && typeof it?.name === "string" && /\/companies\/start-ups\//.test(it.url)) {
            byUrl.set(abs(it.url), { headline: stripHtml(it.name), description: typeof it.description === "string" ? stripHtml(it.description) : null, day: null });
          }
        }
      }
    } catch {
      /* a broken block just means fewer items */
    }
  });

  $(".cardContainer").each((_, el) => {
    const a = $(el).find("h2 a[href]").first();
    const href = a.attr("href");
    if (!href || !/\/companies\/start-ups\//.test(href)) return;
    const url = abs(href);
    const day = cardDate($(el).find(".dateNew span").first().text());
    const prev = byUrl.get(url);
    byUrl.set(url, { headline: prev?.headline ?? stripHtml(a.text()), description: prev?.description ?? null, day });
  });

  const out: RawArticle[] = [];
  for (const [url, v] of byUrl) {
    if (!v.headline) continue;
    const fromId = idDate(url);
    // The id's time must sit within a few days before the card's updated-day; otherwise trust the card.
    const consistent = fromId && (!v.day || (v.day.getTime() - fromId.getTime() < 4 * DAY_MS && fromId.getTime() - v.day.getTime() < DAY_MS));
    out.push({
      sourceUrl: url,
      headline: v.headline,
      snippet: v.description ? truncate(v.description, 800) : null,
      contentText: null,
      publishedAt: consistent ? fromId : v.day ?? fromId,
    });
  }
  return out;
}

/**
 * Mint — Start-ups section. Mint's RSS feeds are general business news (almost no startup funding), so this reads
 * the start-ups listing page instead. A secondary source: it verifies and adds context rather than being the first trigger.
 */
export class MintStartupsAdapter implements FundingSourceAdapter {
  constructor(
    readonly key: string,
    private readonly pageUrl: string,
  ) {}

  async fetchLatest(): Promise<RawArticle[]> {
    const res = await safeFetch(this.pageUrl, { accept: "text/html,application/xhtml+xml" });
    if (res.status !== 200) throw new Error(`${this.key}: listing returned HTTP ${res.status}`);
    const items = parseMintListing(res.text, res.url);
    if (items.length === 0) throw new Error(`${this.key}: listing parsed but contained no articles (page layout may have changed)`);
    return items;
  }
}
