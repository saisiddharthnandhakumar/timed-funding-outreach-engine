import { QuotaExhaustedError } from "./verify";
import { nameParts, sameCompanyDomain } from "./names";
import type { ContactCandidate, FounderRef } from "./types";

/** Hunter's own verdict on a mailbox. `null` when the response carried none. */
export type HunterVerification = "valid" | "accept_all" | "unknown" | null;

export interface HunterHit {
  email: string;
  /** Hunter's 0-100 confidence that this person's address follows that pattern. A heuristic, not a delivery guarantee. */
  score: number;
  verification: HunterVerification;
  /** Public pages where Hunter saw this address (still online). */
  sourceUrls: string[];
}

/** The slice of Hunter used for founder lookups; injectable so the pipeline is testable without the network. */
export interface FounderEmailFinder {
  readonly name: string;
  find(input: { domain: string; firstName: string; lastName: string }): Promise<HunterHit | null>;
}

interface FinderResponse {
  data?: {
    email?: string | null;
    score?: number | null;
    verification?: { status?: string | null } | null;
    sources?: { uri?: string; still_on_page?: boolean }[] | null;
  };
}

/**
 * Hunter Email Finder: "what is the work email of <first> <last> at <domain>?". One call spends one credit, and
 * Hunter charges nothing when it finds no address. The key goes in the X-API-KEY header (never in the URL, so it
 * cannot leak into logs).
 */
export class HunterFinder implements FounderEmailFinder {
  readonly name = "hunter";
  constructor(private readonly apiKey: string, private readonly fetchImpl: typeof fetch = fetch) {}

  async find({ domain, firstName, lastName }: { domain: string; firstName: string; lastName: string }): Promise<HunterHit | null> {
    const url = new URL("https://api.hunter.io/v2/email-finder");
    url.searchParams.set("domain", domain);
    url.searchParams.set("first_name", firstName);
    url.searchParams.set("last_name", lastName);
    const res = await this.fetchImpl(url, { headers: { "X-API-KEY": this.apiKey }, signal: AbortSignal.timeout(20_000) });
    // 429 = monthly credits used up, 402 = no credits on the plan. (403 is a short-term rate limit, treated as an error.)
    if (res.status === 429 || res.status === 402) throw new QuotaExhaustedError("hunter");
    if (res.status === 401) throw new Error("Hunter rejected the API key (HTTP 401). Check HUNTER_API_KEY.");
    if (res.status === 404) return null;
    if (res.status === 400 || res.status === 451) return null; // unusable name/domain, or a claimed address: nothing to use
    if (!res.ok) throw new Error(`Hunter email finder HTTP ${res.status}`);
    const data = ((await res.json()) as FinderResponse).data;
    if (!data?.email) return null;
    const status = data.verification?.status;
    return {
      email: data.email.toLowerCase(),
      score: Math.max(0, Math.min(100, Math.round(data.score ?? 0))),
      verification: status === "valid" || status === "accept_all" || status === "unknown" ? status : null,
      sourceUrls: (data.sources ?? []).filter((s) => s.uri && s.still_on_page !== false).map((s) => s.uri!).slice(0, 3),
    };
  }
}

/** First and last name for the lookup; null when the name is a single token (Hunter needs both). */
export function finderName(founder: FounderRef): { firstName: string; lastName: string } | null {
  const p = nameParts(founder.name);
  return p?.first && p.last ? { firstName: p.first, lastName: p.last } : null;
}

/**
 * Turn a Hunter hit into a candidate. Only a mailbox Hunter reports as *valid* becomes `provider_verified` (the one
 * provider status that may prefill a draft); `accept_all` / `unknown` stay `domain_valid_only`, because the server
 * accepts any address and nothing proves this mailbox exists.
 */
export function candidateFromHunter(founder: FounderRef, hit: HunterHit, domain: string): ContactCandidate | null {
  if (!sameCompanyDomain(hit.email.split("@")[1], domain)) return null; // never accept an address on someone else's domain
  const verified = hit.verification === "valid";
  const seen = hit.sourceUrls.length ? `; seen on ${hit.sourceUrls.length} public page${hit.sourceUrls.length === 1 ? "" : "s"}` : "";
  const verdict = verified ? "Hunter verified the mailbox as valid" : hit.verification === "accept_all" ? "domain accepts all addresses, so the mailbox cannot be confirmed" : "Hunter could not confirm the mailbox";
  return {
    kind: "founder", email: hit.email, contactUrl: null, founderId: founder.id, founderName: founder.name, mailboxRole: null,
    status: verified ? "provider_verified" : "domain_valid_only",
    source: "hunter", sourceUrl: hit.sourceUrls[0] ?? null,
    evidence: `Hunter Email Finder (score ${hit.score}): ${verdict}${seen}`,
    mxValid: null, confidence: verified ? Math.max(70, hit.score) : Math.min(45, hit.score),
  };
}
