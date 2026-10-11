import * as cheerio from "cheerio";
import type { AnyNode } from "domhandler";
import { safeFetch } from "@/lib/net/safe-fetch";
import { truncate } from "@/lib/util/text";

export interface ExtractedPage {
  url: string;
  title: string | null;
  text: string;
  /** Absolute outbound links found inside the main content (used to discover company websites). */
  links: { href: string; text: string }[];
}

const CONTENT_SELECTORS = [
  ".article-section__body", // ET Entrepreneur
  '[itemprop="articleBody"]', "article", ".article-content", ".artText", ".entry-content", ".post-content", ".story-content", "main",
];

export function extractPage(html: string, baseUrl: string, maxChars = 10_000): ExtractedPage {
  const $ = cheerio.load(html);
  const title = $("meta[property='og:title']").attr("content") ?? $("title").first().text() ?? null;
  const ogDescription = $("meta[property='og:description']").attr("content")?.trim();
  $("script, style, noscript, nav, footer, header, aside, form, iframe, svg, .btn-comment, .subscription-in-article, .ad, .related, .share").remove();
  let root: cheerio.Cheerio<AnyNode> = $("body");
  for (const sel of CONTENT_SELECTORS) {
    const el = $(sel).first();
    if (el.length && el.text().trim().length > 400) {
      root = el;
      break;
    }
  }
  const paragraphs = root
    .find("p, h1, h2, h3, li")
    .map((_, el) => $(el).text().replace(/\s+/g, " ").trim())
    .get()
    .filter((t) => t.length > 25);
  const body = paragraphs.length ? paragraphs.join("\n") : root.text().replace(/\s+/g, " ").trim();
  const text = truncate(ogDescription && !body.includes(ogDescription.slice(0, 60)) ? `${ogDescription}\n${body}` : body, maxChars);
  const links: ExtractedPage["links"] = [];
  root.find("a[href]").each((_, el) => {
    const href = $(el).attr("href");
    if (!href) return;
    try {
      const abs = new URL(href, baseUrl);
      if (abs.protocol === "http:" || abs.protocol === "https:") links.push({ href: abs.toString(), text: $(el).text().trim() });
    } catch {
      /* ignore malformed href */
    }
  });
  return { url: baseUrl, title: title ? title.trim() : null, text, links };
}

/** Fetch an article/page through the SSRF-safe client and extract readable text + outbound links. */
export async function fetchPage(url: string, maxChars = 10_000): Promise<ExtractedPage> {
  const res = await safeFetch(url, { maxBytes: 2_000_000 });
  if (res.status >= 400) throw new Error(`HTTP ${res.status} for ${url}`);
  if (!/html|xml|text/i.test(res.contentType)) throw new Error(`Unsupported content-type "${res.contentType}" for ${url}`);
  return extractPage(res.text, res.url, maxChars);
}
