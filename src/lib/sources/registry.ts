import type { SourceRow } from "@/types/domain";
import { NewsSitemapAdapter, RssAdapter } from "./feeds";
import { MintStartupsAdapter } from "./mint";
import { INVESTOR_SITES, createInvestorAdapter } from "@/lib/investors/registry";
import type { FundingSourceAdapter } from "./types";

/**
 * Maps a `sources` row to an adapter. Source-specific adapters can be added to
 * SPECIFIC; otherwise the generic adapter for the row's `type` is used, so a new
 * RSS/sitemap source can be added with a single SQL insert and no code change.
 */
const SPECIFIC: Record<string, (row: SourceRow) => FundingSourceAdapter> = {
  // et_entrepreneur / inc42_buzz / yourstory → RSS; entrackr → news sitemap.
  // (They need no custom code today; register an override here if a feed's quirks require it.)
  // Mint's RSS is general business news, so its start-ups section page is read instead.
  mint_startups: (row) => new MintStartupsAdapter(row.key, row.feed_url ?? "https://www.livemint.com/companies/start-ups"),
};

export function createAdapter(row: SourceRow): FundingSourceAdapter {
  const specific = SPECIFIC[row.key];
  if (specific) return specific(row);
  if (row.key in INVESTOR_SITES) return createInvestorAdapter(row);
  if (!row.feed_url) throw new Error(`Source ${row.key} has no feed_url`);
  switch (row.type) {
    case "rss":
      return new RssAdapter(row.key, row.feed_url);
    case "sitemap":
      return new NewsSitemapAdapter(row.key, row.feed_url);
    default:
      throw new Error(`No adapter for source type "${row.type}" (${row.key})`);
  }
}
