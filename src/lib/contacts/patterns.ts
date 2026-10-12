import { nameParts, registrableDomain } from "./names";
import type { ContactCandidate, FounderRef } from "./types";

export type PatternId = "first" | "first.last" | "firstlast" | "flast" | "first_last" | "f.last";

export function applyPattern(id: PatternId, name: string): string | null {
  const p = nameParts(name);
  if (!p) return null;
  const { first, last } = p;
  switch (id) {
    case "first": return first.length >= 3 ? first : null;
    case "first.last": return last ? `${first}.${last}` : null;
    case "firstlast": return last ? `${first}${last}` : null;
    case "flast": return last ? `${first[0]}${last}` : null;
    case "first_last": return last ? `${first}_${last}` : null;
    case "f.last": return last ? `${first[0]}.${last}` : null;
  }
}

/** Which naming pattern do the company's already-published personal addresses follow? */
export function inferPattern(known: { email: string; name: string }[]): PatternId | null {
  const ids: PatternId[] = ["first.last", "firstlast", "first_last", "f.last", "flast", "first"];
  for (const id of ids) {
    if (known.some((k) => applyPattern(id, k.name) === k.email.split("@")[0].toLowerCase() && (id !== "first" || known.length >= 1))) return id;
  }
  return null;
}

/**
 * GUESSED candidates (status pattern_guessed). They are kept separately for future enrichment attempts
 * and are never presented as confirmed or used to prefill a draft.
 */
export function guessFounderEmails(founder: FounderRef, domain: string, inferred: PatternId | null, max = 3): ContactCandidate[] {
  const d = registrableDomain(domain);
  const order: PatternId[] = inferred ? [inferred, "first", "first.last", "firstlast"] : ["first", "first.last", "firstlast"];
  const out: ContactCandidate[] = [];
  const seen = new Set<string>();
  for (const id of order) {
    const local = applyPattern(id, founder.name);
    if (!local || seen.has(local)) continue;
    seen.add(local);
    out.push({
      kind: "founder", email: `${local}@${d}`, contactUrl: null, founderId: founder.id, founderName: founder.name, mailboxRole: null,
      status: "pattern_guessed", source: "pattern", sourceUrl: null,
      evidence: `Generated from the "${id}" naming pattern${inferred === id ? " (the pattern seen in this company's published addresses)" : ""}. Not published anywhere.`,
      mxValid: null, confidence: inferred === id ? 30 : 20,
    });
    if (out.length >= max) break;
  }
  return out;
}
