import { domainFromUrl, normalizeCompanyName } from "@/lib/util/text";
import { matchRound, matchStartup, type RoundKey, type StartupKey } from "./matching";

/** Persistence surface needed by dedup — implemented by Supabase and by an in-memory fake in tests. */
export interface DedupeRepository {
  findStartupsByKeys(domain: string | null, normalizedName: string): Promise<StartupKey[]>;
  createStartup(input: { name: string; normalized_name: string; domain: string | null; website: string | null; hq_country: string | null; hq_city: string | null; description: string | null }): Promise<StartupKey>;
  findRoundsForStartup(startupId: string): Promise<RoundKey[]>;
  createRound(input: { startup_id: string; stage: string; amount: number | null; currency: string | null; announcement_date: string; earliest_source_published_at: string | null }): Promise<RoundKey>;
  /** Idempotent: re-attaching the same article is a no-op. Returns false if the article was already attached. */
  attachSource(input: { funding_round_id: string; funding_article_id: string; source_id: string; source_published_at: string | null; first_seen_at: string }): Promise<boolean>;
  updateEarliestPublished(roundId: string, publishedAt: string): Promise<void>;
}

export interface ResolveInput {
  company: { name: string; website?: string | null; hqCountry: string | null; hqCity: string | null; description: string | null };
  round: { stage: string; amount: number | null; currency: string | null; announcementDate: Date; publishedAt: Date | null };
  article: { id: string; sourceId: string; firstSeenAt: Date };
}

export interface ResolveResult {
  startup: StartupKey;
  round: RoundKey;
  /** True when this article created the startup+round (=> run enrichment/scoring). */
  isNewRound: boolean;
  startupMatch: "created" | "domain" | "normalized_name";
}

const isoDate = (d: Date) => d.toISOString().slice(0, 10);

/**
 * One startup + one funding_round per real-world event, many funding_round_sources.
 * Safe under concurrent runs: unique-violation losers re-read and attach instead of duplicating.
 */
export async function resolveStartupAndRound(repo: DedupeRepository, input: ResolveInput): Promise<ResolveResult> {
  const domain = domainFromUrl(input.company.website ?? null);
  const normalized = normalizeCompanyName(input.company.name);

  const candidates = await repo.findStartupsByKeys(domain, normalized);
  const match = matchStartup({ name: input.company.name, domain }, candidates);
  let startup: StartupKey;
  let startupMatch: ResolveResult["startupMatch"];
  if (match) {
    startup = match.startup;
    startupMatch = match.method;
  } else {
    try {
      startup = await repo.createStartup({
        name: input.company.name.trim(),
        normalized_name: normalized,
        domain,
        website: input.company.website ?? null,
        hq_country: input.company.hqCountry,
        hq_city: input.company.hqCity,
        description: input.company.description,
      });
      startupMatch = "created";
    } catch (err) {
      if ((err as { code?: string }).code !== "23505") throw err;
      const again = matchStartup({ name: input.company.name, domain }, await repo.findStartupsByKeys(domain, normalized));
      if (!again) throw err;
      startup = again.startup;
      startupMatch = again.method;
    }
  }

  const rounds = await repo.findRoundsForStartup(startup.id);
  const candidateRound = {
    stage: input.round.stage,
    amount: input.round.amount,
    currency: input.round.currency,
    announcement_date: isoDate(input.round.announcementDate),
  };
  let round = matchRound(candidateRound, rounds);
  let isNewRound = false;
  if (!round) {
    try {
      round = await repo.createRound({
        startup_id: startup.id,
        ...candidateRound,
        earliest_source_published_at: input.round.publishedAt?.toISOString() ?? null,
      });
      isNewRound = true;
    } catch (err) {
      if ((err as { code?: string }).code !== "23505") throw err;
      round = matchRound(candidateRound, await repo.findRoundsForStartup(startup.id));
      if (!round) throw err;
    }
  }

  await repo.attachSource({
    funding_round_id: round.id,
    funding_article_id: input.article.id,
    source_id: input.article.sourceId,
    source_published_at: input.round.publishedAt?.toISOString() ?? null,
    first_seen_at: input.article.firstSeenAt.toISOString(),
  });
  if (!isNewRound && input.round.publishedAt) await repo.updateEarliestPublished(round.id, input.round.publishedAt.toISOString());

  return { startup, round, isNewRound, startupMatch };
}
