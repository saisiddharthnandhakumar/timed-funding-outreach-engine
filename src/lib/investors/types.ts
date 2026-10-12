/**
 * Investor sites are a different kind of source from news feeds: they are first-party, change slowly, and answer
 * "who backed this, at what stage, with which founders" as well as "did a round just happen".
 * A site implements `discover` (recent investment posts → funding signals), `findEntry` (portfolio lookup → facts
 * for enrichment), or both. Nothing here knows about the database or the pipeline.
 */
export type SiteRole = "discovery" | "enrichment" | "verification";

export interface FetchedPage {
  url: string;
  status: number;
  text: string;
}

export interface SiteContext {
  /** Polite fetch: robots.txt-checked, rate-limited per host, cached for the process. Throws on transport errors. */
  fetch(url: string): Promise<FetchedPage>;
  now: Date;
  /** Only posts published within this many days are of interest (no historical backfill). */
  windowDays: number;
  /** Upper bound on detail pages fetched in one `discover` call. */
  maxPages: number;
  /** True when this exact URL is already stored as an article, so it needn't be fetched again. */
  isKnownUrl(url: string): boolean;
  /** Human-readable note (surfaced in pipeline events); never throws. */
  note(message: string): void;
}

export type SignalType = "investment_announcement" | "portfolio_funding_news" | "why_we_invested";

/** What a post on an investor's site says happened. Unknown values stay null. */
export interface DiscoverySignal {
  signalType: SignalType;
  sourceName: string;
  sourceUrl: string;
  headline: string;
  summary: string | null;
  publishedAt: Date | null;
  companyName: string | null;
  companyWebsite: string | null;
  sector: string | null;
  stage: string | null;
  fundingAmount: number | null;
  fundingCurrency: string | null;
  founders: string[];
  coInvestors: string[];
}

/** A company's page in an investor's portfolio. */
export interface PortfolioEntry {
  pageUrl: string;
  companyName: string;
  website: string | null;
  sector: string | null;
  stage: string | null;
  partneredYear: number | null;
  location: string | null;
  description: string | null;
  founders: { name: string; role: string | null }[];
  coInvestors: string[];
  /** Short points ("experienced founding team"), never article text. */
  rationale: string[];
  status: string | null;
}

export interface InvestorSite {
  readonly key: string;
  readonly name: string;
  readonly roles: SiteRole[];
  readonly baseUrl: string;
  /** Response size cap for this site's pages (default 1.5 MB). Needed where an index page is genuinely large. */
  readonly maxBytes?: number;
  /** Recent investment posts as signals. Incremental: skip anything `ctx.isKnownUrl`. */
  discover?(ctx: SiteContext): Promise<DiscoverySignal[]>;
  /** The portfolio page for one company, or null when the investor doesn't list it. */
  findEntry?(ctx: SiteContext, q: { name: string; domain: string | null }): Promise<PortfolioEntry | null>;
}

export const emptySignal = (site: { name: string }, partial: Pick<DiscoverySignal, "signalType" | "sourceUrl" | "headline"> & Partial<DiscoverySignal>): DiscoverySignal => ({
  sourceName: site.name,
  summary: null,
  publishedAt: null,
  companyName: null,
  companyWebsite: null,
  sector: null,
  stage: null,
  fundingAmount: null,
  fundingCurrency: null,
  founders: [],
  coInvestors: [],
  ...partial,
});
