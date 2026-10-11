/** Normalised article as emitted by any source adapter. */
export interface RawArticle {
  sourceUrl: string;
  headline: string;
  snippet: string | null;
  /** Full text when the feed itself carries it (e.g. content:encoded). */
  contentText: string | null;
  /** Timestamp published by the source, when available. */
  publishedAt: Date | null;
}

/**
 * Add a new funding source by implementing this interface and registering it
 * in `registry.ts` (or simply inserting an rss/sitemap row into `sources`).
 */
export interface FundingSourceAdapter {
  readonly key: string;
  fetchLatest(): Promise<RawArticle[]>;
}
