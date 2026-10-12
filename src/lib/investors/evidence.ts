import type { StartupProfile } from "@/lib/gemini/schemas";
import { domainFromUrl } from "@/lib/util/text";
import type { PortfolioEntry } from "./types";

/**
 * Evidence model. Every fact we keep from a source carries its evidence type, so a weak result never silently
 * replaces a stronger one and disagreements stay visible. Evidence raises DATA CONFIDENCE only; nothing here
 * feeds the fit score.
 */
export type EvidenceType = "company_first_party" | "investor_first_party" | "reputable_media" | "database" | "search_result";
export type Confidence = "high" | "medium" | "low";

/** Higher wins when two sources disagree about the same field. First-party sources are the strongest. */
export const EVIDENCE_RANK: Record<EvidenceType, number> = {
  company_first_party: 4,
  investor_first_party: 4,
  reputable_media: 3,
  database: 2,
  search_result: 1,
};

export interface EvidenceDraft {
  fieldKey: string;
  value: unknown;
  evidenceType: EvidenceType;
  sourceKey: string;
  sourceUrl: string | null;
  confidence: Confidence;
  /** Set when another source disagrees: what each side said. */
  conflict: { field: string; values: { value: unknown; sourceKey: string; evidenceType: EvidenceType }[] } | null;
  /** Distinguishes several facts of one field from one source (e.g. each founder). */
  discriminator?: string;
}

/** Simple categories, not false precision: agreement across sources is what earns "high". */
export function confidenceFor(type: EvidenceType, agreeingSources: number): Confidence {
  if (agreeingSources >= 2) return "high";
  if (type === "search_result") return "low";
  return "medium";
}

export const normalizePerson = (n: string) => n.toLowerCase().replace(/\b(mr|ms|mrs|dr|prof)\b\.?/g, "").replace(/[^a-z\s]/g, " ").replace(/\s+/g, " ").trim();
/** Same person when the normalised names match, or share first and last token ("Aarav K. Mehta" ~ "Aarav Mehta"). */
export function samePerson(a: string, b: string): boolean {
  const x = normalizePerson(a);
  const y = normalizePerson(b);
  if (!x || !y) return false;
  if (x === y) return true;
  const tx = x.split(" ");
  const ty = y.split(" ");
  return tx.length > 1 && ty.length > 1 && tx[0] === ty[0] && tx[tx.length - 1] === ty[ty.length - 1];
}

export interface InvestorEntry extends PortfolioEntry {
  sourceKey: string;
  sourceName: string;
}

export interface MergeResult {
  profile: StartupProfile;
  evidence: EvidenceDraft[];
  /** Fields where an investor's entry disagreed with what research already had (existing value kept). */
  conflicts: { field: string; existing: unknown; other: unknown; source: string }[];
}

/**
 * Fold investor portfolio entries into a researched profile WITHOUT overwriting what research already established:
 * null fields are filled, existing values are kept, disagreements are flagged. Geography (hq_country / hq_city) is
 * never filled from here: it feeds the hard filter, and changing eligibility is out of scope for investor data.
 */
export function mergeInvestorEntries(profile: StartupProfile, entries: InvestorEntry[]): MergeResult {
  const out: StartupProfile = { ...profile, founders: profile.founders.map((f) => ({ ...f })) };
  const evidence: EvidenceDraft[] = [];
  const conflicts: MergeResult["conflicts"] = [];
  const base = (e: InvestorEntry) => ({ evidenceType: "investor_first_party" as const, sourceKey: e.sourceKey, sourceUrl: e.pageUrl, conflict: null });

  for (const e of entries) {
    evidence.push({
      ...base(e), fieldKey: "portfolio_membership", confidence: "medium",
      value: { investor: e.sourceName, status: e.status, partnered_year: e.partneredYear, stage_at_entry: e.stage },
    });

    // website: fill if missing; agreement raises confidence; a different domain is a conflict.
    if (e.website) {
      const theirs = domainFromUrl(e.website);
      const ours = domainFromUrl(out.website);
      if (!out.website) {
        out.website = e.website;
        evidence.push({ ...base(e), fieldKey: "website", value: e.website, confidence: "medium" });
      } else if (theirs && ours && theirs === ours) {
        evidence.push({ ...base(e), fieldKey: "website", value: e.website, confidence: confidenceFor("investor_first_party", 2) });
      } else if (theirs && ours) {
        const conflict = { field: "website", values: [{ value: out.website, sourceKey: "research", evidenceType: "reputable_media" as const }, { value: e.website, sourceKey: e.sourceKey, evidenceType: "investor_first_party" as const }] };
        conflicts.push({ field: "website", existing: out.website, other: e.website, source: e.sourceName });
        evidence.push({ ...base(e), fieldKey: "website", value: e.website, confidence: "low", conflict });
      }
    }

    // founders: fill missing names/roles; if nobody overlaps, don't add anyone and flag it.
    if (e.founders.length) {
      const overlap = e.founders.some((f) => out.founders.some((p) => samePerson(p.name, f.name)));
      if (out.founders.length && !overlap) {
        const conflict = { field: "founders", values: [{ value: out.founders.map((f) => f.name), sourceKey: "research", evidenceType: "reputable_media" as const }, { value: e.founders.map((f) => f.name), sourceKey: e.sourceKey, evidenceType: "investor_first_party" as const }] };
        conflicts.push({ field: "founders", existing: out.founders.map((f) => f.name), other: e.founders.map((f) => f.name), source: e.sourceName });
        evidence.push({ ...base(e), fieldKey: "founders", value: e.founders, confidence: "low", conflict });
      } else {
        for (const f of e.founders) {
          const known = out.founders.find((p) => samePerson(p.name, f.name));
          if (known) {
            if (!known.role && f.role) known.role = f.role;
            evidence.push({ ...base(e), fieldKey: "founder", discriminator: normalizePerson(f.name), value: { name: known.name, role: known.role }, confidence: confidenceFor("investor_first_party", 2) });
          } else {
            out.founders.push({ name: f.name, role: f.role, background: null, linkedin_url: null });
            evidence.push({ ...base(e), fieldKey: "founder", discriminator: normalizePerson(f.name), value: { name: f.name, role: f.role }, confidence: "medium" });
          }
        }
      }
    }

    // sector / description: fill if missing; otherwise keep ours and record theirs as evidence.
    if (e.sector) {
      if (!out.sector) out.sector = e.sector;
      evidence.push({ ...base(e), fieldKey: "sector", value: e.sector, confidence: "medium" });
    }
    if (e.description && !out.description) out.description = e.description;

    // Facts kept as evidence only (never merged into the profile).
    if (e.location) evidence.push({ ...base(e), fieldKey: "location", value: e.location, confidence: "medium" });
    if (e.coInvestors.length) evidence.push({ ...base(e), fieldKey: "co_investors", value: e.coInvestors, confidence: "medium" });
    if (e.rationale.length) evidence.push({ ...base(e), fieldKey: "investment_rationale", value: e.rationale.slice(0, 3), confidence: "medium" });
  }
  return { profile: out, evidence, conflicts };
}

const sameAmount = (a: number, b: number) => Math.max(a, b) / Math.min(a, b) <= 1.03;

export interface FundingFact {
  value: unknown;
  sourceKey: string;
  evidenceType: EvidenceType;
}

/**
 * Do these reports of ONE field of ONE round disagree? Amounts in the same currency differing by more than ~3% (so
 * "$3M" vs "$3.2M" is flagged but rounding isn't) and different stages are conflicts. Returns the disagreeing values.
 */
export function fundingConflict(field: "funding_amount" | "funding_stage", facts: FundingFact[]): FundingFact[] | null {
  if (facts.length < 2) return null;
  if (field === "funding_stage") return new Set(facts.map((f) => String(f.value))).size > 1 ? facts : null;
  const money = facts.filter((f) => f.value && typeof (f.value as { amount?: unknown }).amount === "number");
  for (const a of money) {
    for (const b of money) {
      const x = a.value as { amount: number; currency: string | null };
      const y = b.value as { amount: number; currency: string | null };
      if (a !== b && x.currency && x.currency === y.currency && x.amount > 0 && y.amount > 0 && !sameAmount(x.amount, y.amount)) return money;
    }
  }
  return null;
}
