import { lookup } from "node:dns/promises";
import * as cheerio from "cheerio";
import { defaultFetcher, type PageFetcher } from "@/lib/contacts/http";
import { registrableDomain } from "@/lib/contacts/names";
import { getSearch, type SearchService } from "@/lib/websearch";

/**
 * Finds a startup's OFFICIAL website without any search engine or AI quota: guess the domain from the company name,
 * keep only guesses that exist in DNS, and accept one only if its homepage actually names the company. Used when the
 * funding article didn't link the site and grounded search is unavailable, so the contact crawl always has a site.
 */

const LEGAL = new Set(["pvt", "private", "ltd", "limited", "llp", "inc", "incorporated", "corp", "corporation", "llc", "technologies", "technology", "solutions", "systems", "software", "india", "ai", "labs", "lab", "tech", "io", "app", "apps", "hq"]);
/** Words that describe what a company does rather than who it is ("Tessolve Semiconductor" → "tessolve"). */
const DESCRIPTORS = new Set(["semiconductor", "semiconductors", "networks", "network", "ventures", "group", "industries", "digital", "innovations", "health", "healthcare", "finance", "financial", "robotics", "motors", "foods", "bio", "biosciences", "pharma", "energy", "mobility", "logistics", "media", "entertainment", "learning", "education", "analytics", "cloud", "data"]);
/** Sites that describe companies but are never a company's own website. */
const NOT_OFFICIAL = new Set([
  "linkedin.com", "facebook.com", "instagram.com", "twitter.com", "x.com", "youtube.com", "wikipedia.org", "crunchbase.com", "tracxn.com", "zaubacorp.com",
  "ambitionbox.com", "glassdoor.com", "glassdoor.co.in", "indeed.com", "naukri.com", "justdial.com", "tofler.in", "thecompanycheck.com", "f6s.com", "pitchbook.com",
  "cbinsights.com", "owler.com", "dnb.com", "apollo.io", "rocketreach.co", "zoominfo.com", "medium.com", "github.com", "inc42.com", "entrackr.com", "yourstory.com",
  "economictimes.indiatimes.com", "indiatimes.com", "livemint.com", "business-standard.com", "moneycontrol.com", "techcrunch.com", "bloomberg.com", "reuters.com",
  "thehindu.com", "hindustantimes.com", "linktr.ee", "g2.com", "capterra.com", "playstore.google.com", "apps.apple.com", "google.com", "nxp.com", "tpg.com",
]);
export const isNotOfficial = (host: string) => [...NOT_OFFICIAL].some((d) => host === d || host.endsWith(`.${d}`));

const TLDS = ["com", "in", "co.in", "ai", "io", "co", "tech", "org"];
const PARKED = /domain (is )?(for sale|available)|buy this domain|this domain may be for sale|parked (free|domain)|coming soon|under construction/i;

const tokensOf = (name: string): string[] =>
  name.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter(Boolean);

/** The distinctive brand words of a name, most specific first, e.g. "Tessolve Semiconductor Pvt Ltd" → ["tessolve", "tessolvesemiconductor"]. */
export function brandLabels(companyName: string): string[] {
  const t = tokensOf(companyName);
  if (t[0] === "the") t.shift();
  while (t.length > 1 && LEGAL.has(t[t.length - 1])) t.pop();
  const core = [...t];
  while (core.length > 1 && DESCRIPTORS.has(core[core.length - 1])) core.pop();
  const labels = [core.join(""), t.join("")];
  if (t.length > 1 && t[0].length >= 6) labels.push(t[0]);
  return [...new Set(labels)].filter((l) => l.length >= 4);
}

export function candidateHosts(companyName: string): string[] {
  const out: string[] = [];
  for (const label of brandLabels(companyName)) for (const tld of TLDS) out.push(`${label}.${tld}`);
  return out;
}

async function resolves(host: string): Promise<boolean> {
  try {
    await Promise.race([lookup(host), new Promise((_, rej) => setTimeout(() => rej(new Error("dns timeout")), 3000))]);
    return true;
  } catch {
    return false;
  }
}

/** Does this homepage plausibly belong to the company? The brand must appear in its title/headings/opening text. */
export function pageNamesCompany(html: string, companyName: string): boolean {
  const labels = brandLabels(companyName);
  if (!labels.length) return false;
  const $ = cheerio.load(html);
  const head = [$("title").text(), $('meta[property="og:site_name"]').attr("content"), $('meta[property="og:title"]').attr("content"), $("h1").first().text(), $("h2").first().text()].filter(Boolean).join(" ");
  $("script, style, noscript").remove();
  const body = $("body").text().replace(/\s+/g, " ").slice(0, 4000);
  if (PARKED.test(head) || PARKED.test(body.slice(0, 600))) return false;
  const flat = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
  const hay = flat(`${head} ${body}`);
  return labels.some((l) => hay.includes(l));
}

export interface WebsiteResolverDeps {
  fetcher?: PageFetcher;
  dns?: (host: string) => Promise<boolean>;
  /** Most homepages fetched to verify candidates. */
  maxProbes?: number;
  /** Web search to fall back on when the domain guesses find nothing (Serper/Tavily). Off unless supplied. */
  search?: Pick<SearchService, "find"> | null;
}

/** How substantial a homepage is: a real company site has real text and internal links, a placeholder does not. */
export function pageSubstance(html: string): number {
  const $ = cheerio.load(html);
  $("script, style, noscript").remove();
  const text = $("body").text().replace(/\s+/g, " ").trim().length;
  return Math.min(text, 20_000) + $("a[href]").length * 40;
}

/**
 * Probes every plausible domain (apex and www, since many sites only serve one) and returns the best match: a
 * candidate must name the company, and among those the most substantial homepage wins, so a one-line placeholder
 * on another TLD can't beat the real site.
 */
export async function resolveOfficialWebsite(companyName: string, deps: WebsiteResolverDeps = {}): Promise<{ url: string; evidence: string } | null> {
  const fetcher = deps.fetcher ?? defaultFetcher;
  const exists = deps.dns ?? resolves;
  const urls: string[] = [];
  const checks = await Promise.all(candidateHosts(companyName).map(async (h) => ({ h, apex: await exists(h), www: await exists(`www.${h}`) })));
  for (const c of checks) {
    if (c.www) urls.push(`https://www.${c.h}/`);
    if (c.apex) urls.push(`https://${c.h}/`);
  }
  const best: { url: string; host: string; score: number; site: string }[] = [];
  const seenSites = new Set<string>();
  let probes = 0;
  for (const url of urls) {
    if (probes >= (deps.maxProbes ?? 8)) break;
    try {
      const host = new URL(url).hostname;
      probes++;
      const res = await fetcher(url);
      if (res.status >= 400 || !/html/i.test(res.contentType)) continue;
      const finalUrl = new URL(res.url);
      const site = registrableDomain(finalUrl.hostname);
      if (seenSites.has(site)) continue; // apex and www of one site (or redirects to it) count once
      seenSites.add(site);
      if (pageNamesCompany(res.text, companyName)) best.push({ url: `${finalUrl.origin}/`, host, score: pageSubstance(res.text), site });
    } catch {
      /* unreachable guess: try the next */
    }
  }
  if (!best.length) return deps.search ? findViaSearch(companyName, deps.search, fetcher, deps.maxProbes ?? 8) : null;
  best.sort((a, b) => b.score - a.score); // stable: earlier (more likely TLD) wins ties
  return { url: best[0].url, evidence: `${best[0].host} exists, its homepage names "${companyName}" and is the most substantial of ${best.length} match(es)` };
}

/**
 * Web-search fallback: ask a search engine for the company's site, drop directories/social/news, and verify each
 * remaining homepage exactly like a guessed domain (it must name the company; the most substantial wins).
 */
async function findViaSearch(companyName: string, search: Pick<SearchService, "find">, fetcher: PageFetcher, maxProbes: number): Promise<{ url: string; evidence: string } | null> {
  const hits = await search.find(`${companyName} official website`, { num: 8 });
  const seen = new Set<string>();
  const best: { url: string; score: number }[] = [];
  for (const h of hits) {
    if (seen.size >= Math.min(4, maxProbes)) break;
    let u: URL;
    try {
      u = new URL(h.url);
    } catch {
      continue;
    }
    const site = registrableDomain(u.hostname);
    if (isNotOfficial(u.hostname) || seen.has(site)) continue;
    seen.add(site);
    try {
      const res = await fetcher(`${u.origin}/`);
      if (res.status >= 400 || !/html/i.test(res.contentType)) continue;
      if (pageNamesCompany(res.text, companyName)) best.push({ url: `${new URL(res.url).origin}/`, score: pageSubstance(res.text) });
    } catch {
      /* unreachable result: skip */
    }
  }
  if (!best.length) return null;
  best.sort((a, b) => b.score - a.score);
  return { url: best[0].url, evidence: `found by web search; homepage names "${companyName}"` };
}

/** Production wiring for the pipeline and contact search: just the URL. */
export const resolveWebsiteUrl = async (companyName: string): Promise<string | null> => (await resolveOfficialWebsite(companyName, { search: getSearch() }))?.url ?? null;
