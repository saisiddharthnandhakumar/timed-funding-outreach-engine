import { db } from "@/lib/supabase/admin";
import type { ResearchDoc } from "@/lib/gemini/tasks";
import { domainFromUrl, errorMessage, normalizeCompanyName, truncate } from "@/lib/util/text";
import type { PipelineLogger } from "@/lib/pipeline/logger";
import { createSiteContext } from "./fetch";
import { INVESTOR_SITES } from "./registry";
import type { InvestorEntry } from "./evidence";
import type { InvestorSite, PortfolioEntry, SiteContext } from "./types";

export interface InvestorLookup {
  gather(q: { name: string; domain: string | null }): Promise<InvestorEntry[]>;
}

interface SourceRowLite {
  id: string;
  key: string;
  name: string;
  config_json: Record<string, unknown> | null;
}

const DEFAULT_TTL_DAYS = 14;

const toEntry = (r: Record<string, any>, s: SourceRowLite): InvestorEntry => ({
  sourceKey: s.key, sourceName: s.name, pageUrl: r.page_url, companyName: r.company_name, website: r.website, sector: r.sector, stage: r.stage,
  partneredYear: r.partnered_year, location: r.location, description: r.description, founders: r.founders ?? [], coInvestors: r.co_investors ?? [],
  rationale: r.rationale ?? [], status: r.status,
});

/**
 * Looks a startup up in each enabled, verified investor source that has the enrichment role. Portfolio data moves
 * slowly, so a cached entry younger than the source's TTL (default 14 days) is reused and the site isn't touched;
 * a miss costs at most the (process-cached) sitemap fetch. Each investor fails independently.
 */
export class InvestorEnricher implements InvestorLookup {
  private readonly ctxs = new Map<string, SiteContext>();
  constructor(
    private readonly opts: { sites?: Record<string, InvestorSite>; log?: PipelineLogger; context?: () => SiteContext } = {},
  ) {}

  /** One polite context per site (shared across lookups in a run, so a sitemap is fetched once), honouring the site's size cap. */
  private context(site: InvestorSite): SiteContext {
    let c = this.ctxs.get(site.key);
    if (!c) {
      c = this.opts.context?.() ?? createSiteContext({ maxPages: 3, maxBytes: site.maxBytes });
      this.ctxs.set(site.key, c);
    }
    return c;
  }

  private async sources(): Promise<SourceRowLite[]> {
    const { data, error } = await db()
      .from("sources")
      .select("id,key,name,config_json,source_role")
      .eq("enabled", true)
      .eq("source_type", "investor")
      .eq("adapter_status", "verified")
      .contains("source_role", ["enrichment"]);
    if (error) throw new Error(`investor sources: ${error.message}`);
    return (data ?? []) as SourceRowLite[];
  }

  private async cached(s: SourceRowLite, q: { name: string; domain: string | null }, ttlDays: number): Promise<{ row: Record<string, any>; fresh: boolean } | null> {
    const norm = normalizeCompanyName(q.name);
    let query = db().from("investor_portfolio_entries").select("*").eq("source_id", s.id);
    query = q.domain ? query.or(`domain.eq.${q.domain},normalized_name.eq.${norm}`) : query.eq("normalized_name", norm);
    const { data } = await query.order("fetched_at", { ascending: false }).limit(1);
    const row = data?.[0];
    if (!row) return null;
    return { row, fresh: Date.now() - new Date(row.fetched_at).getTime() < ttlDays * 86_400_000 };
  }

  private async store(s: SourceRowLite, e: PortfolioEntry) {
    await db().from("investor_portfolio_entries").upsert(
      {
        source_id: s.id, page_url: e.pageUrl, company_name: e.companyName, normalized_name: normalizeCompanyName(e.companyName), website: e.website,
        domain: domainFromUrl(e.website), sector: e.sector, stage: e.stage, partnered_year: e.partneredYear, location: e.location,
        description: e.description, founders: e.founders, co_investors: e.coInvestors, rationale: e.rationale, status: e.status, fetched_at: new Date().toISOString(),
      },
      { onConflict: "source_id,page_url" },
    );
  }

  async gather(q: { name: string; domain: string | null }): Promise<InvestorEntry[]> {
    const sites = this.opts.sites ?? INVESTOR_SITES;
    let sources: SourceRowLite[];
    try {
      sources = await this.sources();
    } catch (err) {
      await this.opts.log?.event("pipeline", null, "investor_lookup_failed", errorMessage(err));
      return [];
    }
    const out: InvestorEntry[] = [];
    for (const s of sources) {
      try {
        const site = sites[s.key];
        if (!site?.findEntry) continue;
        const ttl = typeof s.config_json?.ttl_days === "number" ? (s.config_json.ttl_days as number) : DEFAULT_TTL_DAYS;
        const hit = await this.cached(s, q, ttl);
        if (hit?.fresh) {
          out.push(toEntry(hit.row, s));
          continue;
        }
        let entry: PortfolioEntry | null = null;
        try {
          entry = await site.findEntry(this.context(site), q);
        } catch (err) {
          if (!hit) throw err;
          await this.opts.log?.event("source", s.id, "investor_refresh_failed", `${s.key}: using cached entry (${errorMessage(err)})`);
          out.push(toEntry(hit.row, s));
          continue;
        }
        if (entry) {
          await this.store(s, entry);
          out.push({ ...entry, sourceKey: s.key, sourceName: s.name });
        }
      } catch (err) {
        await this.opts.log?.event("source", s.id, "investor_lookup_failed", `${s.key}: ${errorMessage(err)}`);
      }
    }
    return out;
  }
}

/** Prompt documents for research synthesis: compact facts, first-party, clearly labelled. */
export function entriesToDocs(entries: InvestorEntry[]): ResearchDoc[] {
  return entries.map((e) => ({
    url: e.pageUrl,
    kind: "investor_portfolio",
    title: `${e.sourceName} portfolio page for ${e.companyName}`,
    text: truncate(
      [
        `Published by the investor ${e.sourceName} on its own website (first-party, but an investor's description).`,
        e.status ? `Portfolio status: ${e.status}.` : "",
        e.sector ? `Sector: ${e.sector}.` : "",
        e.stage ? `Stage when the investor first invested: ${e.stage}${e.partneredYear ? ` (partnered ${e.partneredYear})` : ""}.` : "",
        e.location ? `Location: ${e.location}.` : "",
        e.website ? `Company website: ${e.website}.` : "",
        e.founders.length ? `Founders: ${e.founders.map((f) => (f.role ? `${f.name} (${f.role})` : f.name)).join(", ")}.` : "",
        e.coInvestors.length ? `Co-investors: ${e.coInvestors.join(", ")}.` : "",
        e.description ? `Description: ${e.description}` : "",
      ].filter(Boolean).join("\n"),
      2000,
    ),
  }));
}
