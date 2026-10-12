import { db } from "@/lib/supabase/admin";
import type { AIService } from "@/lib/gemini/service";
import { synthesizeProfile, type ResearchDoc } from "@/lib/gemini/tasks";
import type { StartupProfile } from "@/lib/gemini/schemas";
import { fetchPage } from "@/lib/sources/article-text";
import { domainFromUrl, errorMessage, normalizeCompanyName, truncate } from "@/lib/util/text";
import type { PipelineLogger } from "@/lib/pipeline/logger";

/** Replaceable research backend: returns raw documents about a company. */
export interface ResearchProvider {
  readonly name: string;
  gather(ctx: ResearchContext): Promise<ResearchDoc[]>;
}

export interface ResearchContext {
  companyName: string;
  hqCountry: string | null;
  articles: { url: string; text: string; links: { href: string; text: string }[] }[];
  website: string | null;
  /** Extra evidence documents (e.g. investor portfolio pages) offered to synthesis after the company's own site. */
  extraDocs?: ResearchDoc[];
  /** Last-resort website discovery (no AI quota needed). Off unless supplied. */
  resolveWebsite?: (companyName: string) => Promise<string | null>;
}

const NON_COMPANY_DOMAINS = [
  "economictimes.indiatimes.com", "indiatimes.com", "inc42.com", "entrackr.com", "yourstory.com", "linkedin.com", "twitter.com", "x.com",
  "facebook.com", "instagram.com", "youtube.com", "medium.com", "crunchbase.com", "tracxn.com", "wikipedia.org", "google.com",
  "techcrunch.com", "moneycontrol.com", "livemint.com", "business-standard.com", "thehindu.com", "hindustantimes.com", "pib.gov.in",
  "t.me", "whatsapp.com", "telegram.me", "apple.com", "play.google.com", "bloomberg.com", "reuters.com", "tiktok.com", "github.com",
];

function isMediaOrSocial(host: string): boolean {
  return NON_COMPANY_DOMAINS.some((d) => host === d || host.endsWith(`.${d}`));
}

/** "nimbus.co.in" → "nimbus". */
export function siteLabel(host: string): string {
  const parts = host.replace(/^www\./, "").split(".");
  while (parts.length > 1 && ["co", "com", "org", "net", "gov", "ac"].includes(parts[parts.length - 2])) parts.splice(parts.length - 2, 1);
  return (parts.length > 1 ? parts[parts.length - 2] : parts[0]).replace(/-/g, "");
}

export function hostMatchesCompany(host: string, companyName: string): boolean {
  const label = siteLabel(host);
  const n = normalizeCompanyName(companyName);
  return label.length >= 4 && n.length >= 4 && (n === label || n.startsWith(label) || label.startsWith(n));
}

/** Look for a link in the source articles whose domain resembles the company name. */
export function discoverWebsiteFromLinks(companyName: string, articles: ResearchContext["articles"]): string | null {
  for (const a of articles) {
    for (const l of a.links) {
      try {
        const u = new URL(l.href);
        const host = u.hostname.toLowerCase().replace(/^www\./, "");
        if (!isMediaOrSocial(host) && hostMatchesCompany(host, companyName)) return `${u.protocol}//${u.hostname}/`;
      } catch {
        /* skip */
      }
    }
  }
  return null;
}

export class ArticleProvider implements ResearchProvider {
  readonly name = "source_articles";
  async gather(ctx: ResearchContext): Promise<ResearchDoc[]> {
    return ctx.articles.map((a) => ({ url: a.url, kind: "source_article", title: null, text: a.text }));
  }
}

export class CompanyWebsiteProvider implements ResearchProvider {
  readonly name = "company_website";
  async gather(ctx: ResearchContext): Promise<ResearchDoc[]> {
    if (!ctx.website) return [];
    const docs: ResearchDoc[] = [];
    const home = await fetchPage(ctx.website, 6000);
    docs.push({ url: home.url, kind: "company_website", title: home.title, text: home.text });
    const host = new URL(home.url).hostname;
    const seen = new Set([home.url]);
    const sub = home.links
      .filter((l) => {
        try {
          const u = new URL(l.href);
          return u.hostname === host && /about|product|platform|solution|team|customer|company|technology/i.test(`${l.text} ${u.pathname}`);
        } catch {
          return false;
        }
      })
      .slice(0, 8);
    for (const l of sub) {
      if (docs.length >= 3 || seen.has(l.href)) continue;
      seen.add(l.href);
      try {
        const p = await fetchPage(l.href, 5000);
        docs.push({ url: p.url, kind: "company_website", title: p.title, text: p.text });
      } catch {
        /* optional page */
      }
    }
    return docs;
  }
}

/** Gemini Flash with Google Search grounding: live web research with citations. */
export class GroundedSearchProvider implements ResearchProvider {
  readonly name = "gemini_google_search";
  lastSources: { url: string; title: string | null }[] = [];
  constructor(private readonly ai: AIService) {}
  async gather(ctx: ResearchContext): Promise<ResearchDoc[]> {
    const res = await this.ai.generateGrounded({
      task: "research_grounded",
      system:
        "You are a startup researcher. Use Google Search. Report only facts found in search results, with no speculation. If something cannot be found, say 'not found'.",
      prompt: `Research the Indian startup "${ctx.companyName}"${ctx.hqCountry ? ` (${ctx.hqCountry})` : ""} that recently announced a funding round. Report concisely: official website; what the product does and for whom; technology or IP; founders and their prior experience; customers, pilots, revenue or other traction; investors; city of headquarters. Prefer the company's own site, the funding announcement, investor posts and reputable publications.`,
    });
    this.lastSources = res.sources;
    if (!res.text.trim()) return [];
    const cites = res.sources.map((s) => `- ${s.title ?? "source"}: ${s.url}`).join("\n");
    return [{ url: "gemini-google-search", kind: "search_grounding", title: "Gemini Google Search summary", text: `${res.text}\n\nCitations:\n${cites}` }];
  }
}

export interface EnrichmentResult {
  profile: StartupProfile;
  sources: { url: string; kind: string; title: string | null; fetched_at: string }[];
  warnings: string[];
}

/** Gather public evidence about a startup and synthesise a validated profile (Gemini Task 2). */
export async function researchStartup(ai: AIService, ctx: ResearchContext, log?: PipelineLogger, entityId?: string): Promise<EnrichmentResult> {
  const warnings: string[] = [];
  const docs: ResearchDoc[] = [];
  const grounded = new GroundedSearchProvider(ai);
  const stamp = () => new Date().toISOString();

  docs.push(...(await new ArticleProvider().gather(ctx)));

  let website = ctx.website ?? discoverWebsiteFromLinks(ctx.companyName, ctx.articles);

  try {
    docs.push(...(await grounded.gather(ctx)));
  } catch (err) {
    warnings.push(`grounded search failed: ${errorMessage(err)}`);
    await log?.event("startup", entityId ?? null, "research_provider_failed", `grounded search failed: ${errorMessage(err)}`);
  }

  if (!website) {
    // Grounding source titles are usually the site's domain (e.g. "sunfox.in").
    for (const s of grounded.lastSources) {
      const host = (s.title ?? "").toLowerCase().replace(/^www\./, "");
      if (/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(host) && !isMediaOrSocial(host) && hostMatchesCompany(host, ctx.companyName)) {
        website = `https://${host}/`;
        break;
      }
    }
  }

  if (!website && ctx.resolveWebsite) {
    try {
      website = await ctx.resolveWebsite(ctx.companyName);
      if (website) await log?.event("startup", entityId ?? null, "website_resolved", `${ctx.companyName}: official website found at ${website}`, { website });
    } catch (err) {
      warnings.push(`website lookup failed: ${errorMessage(err)}`);
    }
  }

  let websiteConfirmed: string | null = null;
  if (website) {
    try {
      const siteDocs = await new CompanyWebsiteProvider().gather({ ...ctx, website });
      docs.push(...siteDocs);
      if (siteDocs.length) websiteConfirmed = siteDocs[0].url;
    } catch (err) {
      warnings.push(`company website fetch failed (${website}): ${errorMessage(err)}`);
      await log?.event("startup", entityId ?? null, "research_provider_failed", `website fetch failed: ${errorMessage(err)}`, { website });
    }
  }

  docs.push(...(ctx.extraDocs ?? []));

  const profile = await synthesizeProfile(ai, { companyName: ctx.companyName, hintCountry: ctx.hqCountry, docs });

  // Never trust a model-claimed website we did not actually see.
  const seenHosts = new Set(docs.map((d) => domainFromUrl(d.url)).filter(Boolean));
  const claimedHost = domainFromUrl(profile.website);
  if (profile.website && claimedHost && !seenHosts.has(claimedHost) && !docs.some((d) => d.text.includes(claimedHost))) {
    warnings.push(`discarded unverified website claim ${profile.website}`);
    profile.website = null;
  }
  if (!profile.website && websiteConfirmed) profile.website = websiteConfirmed;

  const usable = new Set(docs.map((d) => d.url));
  for (const s of grounded.lastSources) usable.add(s.url);
  profile.source_urls = [...new Set(profile.source_urls.filter((u) => usable.has(u) || /^https?:\/\//.test(u)))].slice(0, 30);

  const sources = [
    ...docs.filter((d) => d.url !== "gemini-google-search").map((d) => ({ url: d.url, kind: d.kind, title: d.title ? truncate(d.title, 160) : null, fetched_at: stamp() })),
    ...grounded.lastSources.map((s) => ({ url: s.url, kind: "search_citation", title: s.title, fetched_at: stamp() })),
  ];
  return { profile, sources, warnings };
}

/** Persist the profile onto startups + founders. Domain collisions are logged, not fatal. */
export async function persistEnrichment(startupId: string, result: EnrichmentResult, log?: PipelineLogger): Promise<void> {
  const p = result.profile;
  const base = {
    description: p.description,
    sector: p.sector,
    subsector: p.subsector,
    business_model: p.business_model,
    hq_city: p.hq_city,
    hq_country: p.hq_country,
    founded_year: p.founded_year,
    profile_json: p,
    research_sources: result.sources,
    enrichment_status: "completed",
    enriched_at: new Date().toISOString(),
  };
  const domain = domainFromUrl(p.website);
  let res = await db().from("startups").update({ ...base, website: p.website, domain }).eq("id", startupId);
  if (res.error?.code === "23505") {
    await log?.event("startup", startupId, "possible_duplicate_startup", `Domain ${domain} already belongs to another startup; saved profile without domain`, { domain });
    res = await db().from("startups").update({ ...base, website: p.website }).eq("id", startupId);
  }
  if (res.error) throw new Error(`persist enrichment: ${res.error.message}`);

  for (const f of p.founders) {
    const { error } = await db()
      .from("founders")
      .upsert(
        { startup_id: startupId, name: f.name.trim(), role: f.role, linkedin_url: f.linkedin_url, background_summary: f.background },
        { onConflict: "startup_id,name", ignoreDuplicates: false },
      );
    if (error && error.code !== "23505" && !/no unique or exclusion constraint/i.test(error.message)) {
      await log?.event("startup", startupId, "founder_persist_failed", error.message);
    }
  }
}
