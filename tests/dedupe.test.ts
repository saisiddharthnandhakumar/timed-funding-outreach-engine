import { describe, expect, it } from "vitest";
import type { DedupeRepository } from "@/lib/deduplication/resolve";
import { resolveStartupAndRound } from "@/lib/deduplication/resolve";
import type { RoundKey, StartupKey } from "@/lib/deduplication/matching";
import { matchRound, matchStartup } from "@/lib/deduplication/matching";
import { normalizeCompanyName, canonicalizeUrl } from "@/lib/util/text";

class MemoryRepo implements DedupeRepository {
  startups: StartupKey[] = [];
  rounds: RoundKey[] = [];
  sources: { funding_round_id: string; funding_article_id: string; source_id: string }[] = [];
  private n = 0;
  async findStartupsByKeys(domain: string | null, normalized: string) {
    return this.startups.filter((s) => s.normalized_name === normalized || (domain && s.domain === domain));
  }
  async createStartup(i: { name: string; normalized_name: string; domain: string | null }) {
    const s = { id: `s${++this.n}`, name: i.name, normalized_name: i.normalized_name, domain: i.domain };
    this.startups.push(s);
    return s;
  }
  async findRoundsForStartup(id: string) { return this.rounds.filter((r) => r.startup_id === id); }
  async createRound(i: Omit<RoundKey, "id">) {
    const r = { id: `r${++this.n}`, ...i };
    this.rounds.push(r);
    return r;
  }
  async attachSource(i: { funding_round_id: string; funding_article_id: string; source_id: string }) {
    if (this.sources.some((s) => s.funding_article_id === i.funding_article_id)) return false;
    this.sources.push(i);
    return true;
  }
  async updateEarliestPublished() {}
}

const report = (articleId: string, sourceId: string, name: string, publishedAt: string, amount = 2_500_000) => ({
  company: { name, hqCountry: "India", hqCity: "Bengaluru", description: null },
  round: { stage: "seed", amount, currency: "USD", announcementDate: new Date(publishedAt), publishedAt: new Date(publishedAt) },
  article: { id: articleId, sourceId, firstSeenAt: new Date(publishedAt) },
});

describe("event deduplication", () => {
  it("same company + same round reported by two sources → one startup, one round, two sources", async () => {
    const repo = new MemoryRepo();
    const a = await resolveStartupAndRound(repo, report("a1", "et", "Nimbus AI", "2026-10-11T04:00:00Z"));
    const b = await resolveStartupAndRound(repo, report("a2", "inc42", "Nimbus AI Pvt. Ltd.", "2026-10-11T07:30:00Z"));
    expect(a.isNewRound).toBe(true);
    expect(b.isNewRound).toBe(false);
    expect(repo.startups).toHaveLength(1);
    expect(repo.rounds).toHaveLength(1);
    expect(repo.sources).toHaveLength(2);
    expect(b.round.id).toBe(a.round.id);
  });
  it("re-ingesting the same article does not duplicate anything", async () => {
    const repo = new MemoryRepo();
    await resolveStartupAndRound(repo, report("a1", "et", "Nimbus AI", "2026-10-11T04:00:00Z"));
    await resolveStartupAndRound(repo, report("a1", "et", "Nimbus AI", "2026-10-11T04:00:00Z"));
    expect(repo.sources).toHaveLength(1);
    expect(repo.rounds).toHaveLength(1);
  });
  it("a different stage for the same startup is a different round", async () => {
    const repo = new MemoryRepo();
    await resolveStartupAndRound(repo, report("a1", "et", "Nimbus AI", "2026-10-11T04:00:00Z"));
    const other = report("a2", "et", "Nimbus AI", "2026-10-11T05:00:00Z");
    other.round.stage = "series-a";
    await resolveStartupAndRound(repo, other);
    expect(repo.startups).toHaveLength(1);
    expect(repo.rounds).toHaveLength(2);
  });
  it("materially different amounts in the same currency are different rounds", () => {
    const existing: RoundKey = { id: "r", startup_id: "s", stage: "seed", amount: 2_000_000, currency: "USD", announcement_date: "2026-10-11" };
    expect(matchRound({ stage: "seed", amount: 2_100_000, currency: "USD", announcement_date: "2026-10-12" }, [existing])).not.toBeNull();
    expect(matchRound({ stage: "seed", amount: 6_000_000, currency: "USD", announcement_date: "2026-10-12" }, [existing])).toBeNull();
    expect(matchRound({ stage: "seed", amount: null, currency: null, announcement_date: "2026-12-30" }, [existing])).toBeNull();
  });
  it("domain is a stronger identity than name", () => {
    const existing: StartupKey[] = [{ id: "s1", name: "Nimbus", normalized_name: "nimbus", domain: "nimbus.ai" }];
    expect(matchStartup({ name: "Totally Different Name", domain: "nimbus.ai" }, existing)?.method).toBe("domain");
  });
});

describe("normalisation", () => {
  it("strips legal suffixes and punctuation", () => {
    expect(normalizeCompanyName("Sunfox Technologies Pvt. Ltd.")).toBe("sunfox");
    expect(normalizeCompanyName("Nimbus AI")).toBe("nimbusai");
    expect(normalizeCompanyName("  Café & Co ")).toBe("cafeandco");
  });
  it("canonicalises URLs", () => {
    expect(canonicalizeUrl("http://www.Inc42.com/buzz/x/?utm_source=a&fbclid=1#top")).toBe("https://inc42.com/buzz/x");
  });
});
