import { db, unwrap } from "@/lib/supabase/admin";
import type { RoundKey, StartupKey } from "./matching";
import type { DedupeRepository } from "./resolve";
import { LIVE_OUTREACH_STATUSES, type OutreachLookup } from "@/lib/outreach/guard";

const STARTUP_COLS = "id, name, normalized_name, domain";
const ROUND_COLS = "id, startup_id, stage, amount, currency, announcement_date";

const toRound = (r: Record<string, unknown>): RoundKey => ({ ...(r as unknown as RoundKey), amount: r.amount == null ? null : Number(r.amount) });

export class SupabaseDedupeRepository implements DedupeRepository {
  async findStartupsByKeys(domain: string | null, normalizedName: string): Promise<StartupKey[]> {
    const filter = domain ? `normalized_name.eq.${normalizedName},domain.eq.${domain}` : `normalized_name.eq.${normalizedName}`;
    return unwrap(await db().from("startups").select(STARTUP_COLS).or(filter), "find startups") as StartupKey[];
  }

  async createStartup(input: Parameters<DedupeRepository["createStartup"]>[0]): Promise<StartupKey> {
    return unwrap(await db().from("startups").insert(input).select(STARTUP_COLS).single(), "create startup") as StartupKey;
  }

  async findRoundsForStartup(startupId: string): Promise<RoundKey[]> {
    const rows = unwrap(await db().from("funding_rounds").select(ROUND_COLS).eq("startup_id", startupId), "find rounds") as Record<string, unknown>[];
    return rows.map(toRound);
  }

  async createRound(input: Parameters<DedupeRepository["createRound"]>[0]): Promise<RoundKey> {
    return toRound(unwrap(await db().from("funding_rounds").insert(input).select(ROUND_COLS).single(), "create round"));
  }

  async attachSource(input: Parameters<DedupeRepository["attachSource"]>[0]): Promise<boolean> {
    const res = await db().from("funding_round_sources").insert(input);
    if (res.error) {
      if (res.error.code === "23505") return false; // already attached — idempotent
      throw new Error(`attach round source: ${res.error.message}`);
    }
    return true;
  }

  async updateEarliestPublished(roundId: string, publishedAt: string): Promise<void> {
    const { data } = await db().from("funding_rounds").select("earliest_source_published_at").eq("id", roundId).single();
    if (!data?.earliest_source_published_at || new Date(publishedAt) < new Date(data.earliest_source_published_at)) {
      await db().from("funding_rounds").update({ earliest_source_published_at: publishedAt }).eq("id", roundId);
    }
  }
}

export class SupabaseOutreachLookup implements OutreachLookup {
  async liveOutreachStatuses(startupId: string): Promise<string[]> {
    const rows = unwrap(
      await db().from("outreach").select("status").eq("startup_id", startupId).in("status", [...LIVE_OUTREACH_STATUSES]),
      "outreach lookup",
    ) as { status: string }[];
    return rows.map((r) => r.status);
  }
}
