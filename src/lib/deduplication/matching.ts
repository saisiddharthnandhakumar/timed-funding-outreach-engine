import { normalizeCompanyName } from "@/lib/util/text";

export interface StartupKey {
  id: string;
  name: string;
  normalized_name: string;
  domain: string | null;
}

export interface RoundKey {
  id: string;
  startup_id: string;
  stage: string;
  amount: number | null;
  currency: string | null;
  announcement_date: string; // YYYY-MM-DD
}

export type StartupMatchMethod = "domain" | "normalized_name";

/** Deterministic startup identity: domain first, then normalised company name. */
export function matchStartup(
  candidate: { name: string; domain: string | null },
  existing: StartupKey[],
): { startup: StartupKey; method: StartupMatchMethod } | null {
  if (candidate.domain) {
    const byDomain = existing.find((s) => s.domain && s.domain === candidate.domain);
    if (byDomain) return { startup: byDomain, method: "domain" };
  }
  const n = normalizeCompanyName(candidate.name);
  const byName = existing.find((s) => s.normalized_name === n);
  return byName ? { startup: byName, method: "normalized_name" } : null;
}

export const ROUND_MATCH_WINDOW_DAYS = 21;

const dayDiff = (a: string, b: string) => Math.abs(Date.parse(a) - Date.parse(b)) / 86_400_000;

/**
 * Two reports describe the same round when they concern the same startup,
 * the same normalised stage, and fall within the match window. If both state
 * an amount in the same currency and the amounts disagree by >25%, they are
 * treated as different rounds (e.g. a bridge/extension reported later).
 */
export function matchRound(
  candidate: { stage: string; amount: number | null; currency: string | null; announcement_date: string },
  existing: RoundKey[],
): RoundKey | null {
  return (
    existing.find((r) => {
      if (r.stage !== candidate.stage) return false;
      if (dayDiff(r.announcement_date, candidate.announcement_date) > ROUND_MATCH_WINDOW_DAYS) return false;
      if (r.amount && candidate.amount && r.currency && candidate.currency && r.currency === candidate.currency) {
        const ratio = Math.max(r.amount, candidate.amount) / Math.min(r.amount, candidate.amount);
        if (ratio > 1.25) return false;
      }
      return true;
    }) ?? null
  );
}
