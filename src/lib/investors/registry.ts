import type { SourceRow } from "@/types/domain";
import type { FundingSourceAdapter } from "@/lib/sources/types";
import { InvestorDiscoveryAdapter } from "./adapter";
import { blume } from "./sites/blume";
import { elevation } from "./sites/elevation";
import { indiaquotient } from "./sites/indiaquotient";
import { nexus } from "./sites/nexus";
import { peakxv } from "./sites/peakxv";
import { stellaris } from "./sites/stellaris";
import { threeone4 } from "./sites/threeone4";
import type { InvestorSite } from "./types";

/**
 * Investor sites, keyed by the `sources.key` they are stored under. Adding an investor means writing one
 * `InvestorSite` in ./sites and listing it here, plus a `sources` row; nothing else in the pipeline changes.
 */
// Antler India is deliberately not registered: its company pages are disallowed by robots.txt and the portfolio list
// would need many fetches per lookup (see sites/antler.ts), so it has no usable surface.
export const INVESTOR_SITES: Record<string, InvestorSite> = Object.fromEntries(
  [blume, stellaris, elevation, nexus, peakxv, threeone4, indiaquotient].map((s) => [s.key, s]),
);

export const isInvestorKey = (key: string) => key in INVESTOR_SITES;

export function createInvestorAdapter(row: SourceRow): FundingSourceAdapter {
  const site = INVESTOR_SITES[row.key];
  if (!site) throw new Error(`No investor site registered for ${row.key}`);
  return new InvestorDiscoveryAdapter(site, row);
}
