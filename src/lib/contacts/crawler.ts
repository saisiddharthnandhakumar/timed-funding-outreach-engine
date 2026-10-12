import * as cheerio from "cheerio";
import { registrableDomain } from "./names";
import { RateLimiter, type PageFetcher } from "./http";
import type { RobotsGuard } from "./robots";

export interface CrawledPage {
  url: string;
  html: string;
}

export interface CrawlResult {
  pages: CrawledPage[];
  /** Human-readable reasons something was skipped/failed (robots, HTTP errors, redirects off-site). */
  notes: string[];
  /** True when the homepage itself could not be fetched/allowed. */
  homepageUnavailable: boolean;
}

const WANTED = /about|team|leadership|founder|people|contact|reach|connect|get-in-touch|press|media|company|who-we-are|our-story|management|story|investors/i;
const FALLBACK_PATHS = ["/contact", "/contact-us", "/about", "/about-us", "/team", "/company"];
const SKIP_EXT = /\.(pdf|png|jpe?g|gif|svg|webp|zip|mp4|mp3|css|js|xml)$/i;

/**
 * Crawl a company's OWN website: homepage + the most relevant internal pages (max `maxPages`).
 * Respects robots.txt, stays on the same registrable domain, rate-limits per host, and goes through the
 * injected (SSRF-hardened) fetcher for every request and redirect.
 */
export async function crawlCompanySite(website: string, deps: { fetcher: PageFetcher; robots: RobotsGuard; maxPages: number; limiter?: RateLimiter }): Promise<CrawlResult> {
  const { fetcher, robots, maxPages } = deps;
  const limiter = deps.limiter ?? new RateLimiter(300);
  const notes: string[] = [];
  const pages: CrawledPage[] = [];
  const seen = new Set<string>();
  let root: URL;
  try {
    root = new URL(website);
  } catch {
    return { pages, notes: [`invalid website URL: ${website}`], homepageUnavailable: true };
  }
  const company = registrableDomain(root.hostname);

  async function visit(url: string): Promise<CrawledPage | null> {
    const key = url.split("#")[0].replace(/\/$/, "");
    if (seen.has(key)) return null;
    seen.add(key);
    try {
      if (!(await robots.allowed(url))) {
        notes.push(`robots.txt disallows ${url}`);
        return null;
      }
      await limiter.wait(new URL(url).host);
      const res = await fetcher(url);
      if (registrableDomain(new URL(res.url).hostname) !== company) {
        notes.push(`${url} redirected off-site to ${new URL(res.url).hostname}; ignored`);
        return null;
      }
      if (res.status >= 400) {
        notes.push(`HTTP ${res.status} for ${url}`);
        return null;
      }
      if (!/html|xml|text/i.test(res.contentType)) return null;
      const page = { url: res.url, html: res.text };
      pages.push(page);
      return page;
    } catch (err) {
      notes.push(`${url}: ${err instanceof Error ? err.message : String(err)}`);
      return null;
    }
  }

  const home = await visit(root.toString());
  const queue: string[] = [];
  if (home) {
    const $ = cheerio.load(home.html);
    const scored: { href: string; score: number }[] = [];
    $("a[href]").each((_, a) => {
      try {
        const u = new URL($(a).attr("href") ?? "", home.url);
        if (!/^https?:$/.test(u.protocol) || registrableDomain(u.hostname) !== company || SKIP_EXT.test(u.pathname)) return;
        const hay = `${$(a).text()} ${u.pathname}`;
        if (!WANTED.test(hay)) return;
        u.hash = "";
        // contact/team/founder pages are the most likely to hold addresses
        const score = (/contact|reach|touch/i.test(hay) ? 3 : 0) + (/team|founder|leadership|people|management/i.test(hay) ? 3 : 0) + (/about/i.test(hay) ? 2 : 1);
        scored.push({ href: u.toString(), score });
      } catch {
        /* ignore */
      }
    });
    scored.sort((a, b) => b.score - a.score);
    for (const s of scored) if (!queue.includes(s.href)) queue.push(s.href);
  }
  // Fall back to conventional paths when the homepage links were not enough (also when the homepage failed).
  for (const p of FALLBACK_PATHS) queue.push(new URL(p, root).toString());

  for (const url of queue) {
    if (pages.length >= maxPages) break;
    await visit(url);
  }
  return { pages, notes, homepageUnavailable: !home };
}
