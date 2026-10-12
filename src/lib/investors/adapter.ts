import { db } from "@/lib/supabase/admin";
import type { FundingSourceAdapter, RawArticle } from "@/lib/sources/types";
import type { SourceRow } from "@/types/domain";
import { canonicalizeUrl, truncate } from "@/lib/util/text";
import { createSiteContext } from "./fetch";
import type { DiscoverySignal, InvestorSite, SiteContext } from "./types";

const line = (label: string, v: string | number | null | undefined) => (v == null || v === "" ? [] : [`${label}: ${v}`]);

/**
 * A signal becomes a normal article, so everything downstream (classification, hard filters, de-duplication, one
 * round with many sources) behaves exactly as it does for news. The structured facts are written into the text
 * so the classifier sees them; unknown values are simply omitted.
 */
export function signalToArticle(s: DiscoverySignal): RawArticle {
  const facts = [
    `Reported by ${s.sourceName} (investor website, first-party). Signal: ${s.signalType.replace(/_/g, " ")}.`,
    ...line("Company", s.companyName),
    ...line("Website", s.companyWebsite),
    ...line("Sector", s.sector),
    ...line("Stage", s.stage),
    ...(s.fundingAmount != null ? [`Amount: ${s.fundingAmount} ${s.fundingCurrency ?? ""}`.trim()] : []),
    ...line("Founders", s.founders.join(", ")),
    ...line("Co-investors", s.coInvestors.join(", ")),
  ];
  return {
    sourceUrl: s.sourceUrl,
    headline: s.headline,
    // The news prefilter keys on words like "investment"/"funding"; investor posts say "investing in"/"why we invested",
    // so the marker keeps genuine announcements from being dropped before classification (the prefilter itself is unchanged).
    snippet: truncate(`Investment announcement from ${s.sourceName}.${s.summary ? ` ${s.summary}` : ""}`, 800),
    contentText: truncate([...facts, s.summary ?? ""].filter(Boolean).join("\n"), 8000),
    publishedAt: s.publishedAt,
  };
}

/** URLs this source has already stored, so a run only fetches posts it hasn't seen. */
export async function loadKnownUrls(sourceId: string, days = 90): Promise<Set<string>> {
  const since = new Date(Date.now() - days * 86_400_000).toISOString();
  const { data } = await db().from("funding_articles").select("canonical_url").eq("source_id", sourceId).gte("first_seen_at", since).limit(5000);
  return new Set((data ?? []).map((r) => canonicalizeUrl(String(r.canonical_url))));
}

export interface InvestorAdapterOptions {
  /** Test seam: supply a ready context instead of building one from the database/network. */
  context?: () => Promise<SiteContext>;
}

/** Runs an investor site's `discover` inside the standard source-ingestion path (isolated: a throw is one source's error). */
export class InvestorDiscoveryAdapter implements FundingSourceAdapter {
  readonly key: string;
  constructor(
    private readonly site: InvestorSite,
    private readonly row: Pick<SourceRow, "id" | "key"> & { config_json?: Record<string, unknown> | null },
    private readonly opts: InvestorAdapterOptions = {},
  ) {
    this.key = row.key;
  }

  async fetchLatest(): Promise<RawArticle[]> {
    if (!this.site.discover) return [];
    const cfg = this.row.config_json ?? {};
    const ctx =
      (await this.opts.context?.()) ??
      createSiteContext({
        windowDays: typeof cfg.window_days === "number" ? cfg.window_days : 14,
        maxPages: typeof cfg.max_pages === "number" ? cfg.max_pages : 12,
        maxBytes: this.site.maxBytes,
        knownUrls: await loadKnownUrls(this.row.id),
      });
    const signals = await this.site.discover(ctx);
    return signals.filter((s) => s.headline && /^https?:\/\//.test(s.sourceUrl)).map(signalToArticle);
  }
}
