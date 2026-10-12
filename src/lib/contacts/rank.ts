import { OUTREACH_SAFE, STATUS_RANK, contactKey, type ContactCandidate, type ContactKind, type StoredContact } from "./types";

export type PreferredType = ContactKind | "not_found";

const SOURCE_ORDER = { company_website: 0, github: 1, web_search: 2, hunter: 2, pattern: 3, manual: 0 } as const;
const MAILBOX_ORDER = { partnerships: 0, general: 0, press: 1, other: 1, support: 2 } as const;

const roleOrder = (role: string | null) => (/\bceo\b|chief executive/i.test(role ?? "") ? 0 : /founder/i.test(role ?? "") ? 1 : 2);

/**
 * Strict hierarchy:
 *   1. publicly confirmed founder email
 *   2. provider-verified founder email (with attribution)
 *   3. publicly confirmed company contact email
 *   4. public contact form
 *   5. nothing reliable → not_found
 * Guessed / domain-valid-only / unverified candidates are never preferred.
 */
export function selectPreferred(contacts: (ContactCandidate & { founderRole?: string | null })[]): { contact: ContactCandidate | null; type: PreferredType } {
  const tier = (c: ContactCandidate): number => {
    if (c.kind === "founder" && c.email && c.status === "publicly_confirmed") return 1;
    if (c.kind === "founder" && c.email && c.status === "provider_verified") return 2;
    if (c.kind === "company" && c.email && OUTREACH_SAFE.has(c.status)) return 3;
    if (c.kind === "contact_form" && c.contactUrl) return 4;
    return 99;
  };
  const eligible = contacts.filter((c) => tier(c) < 99 && c.mxValid !== false);
  if (eligible.length === 0) return { contact: null, type: "not_found" };
  eligible.sort((a, b) => {
    const t = tier(a) - tier(b);
    if (t) return t;
    if (a.kind === "founder") {
      const r = roleOrder(a.founderRole ?? null) - roleOrder(b.founderRole ?? null);
      if (r) return r;
    }
    if (a.kind === "company") {
      const m = MAILBOX_ORDER[a.mailboxRole ?? "other"] - MAILBOX_ORDER[b.mailboxRole ?? "other"];
      if (m) return m;
    }
    return SOURCE_ORDER[a.source] - SOURCE_ORDER[b.source] || b.confidence - a.confidence || contactKey(a).localeCompare(contactKey(b));
  });
  const contact = eligible[0];
  return { contact, type: contact.kind };
}

/**
 * Idempotent merge: never downgrades a stored contact's verification status, keeps its first_found_at,
 * and upgrades it when a better source confirms it later.
 */
export function mergeContact(existing: StoredContact | undefined, found: ContactCandidate, nowIso: string): StoredContact {
  if (!existing) return { ...found, id: null, isPreferred: false, firstFoundAt: nowIso };
  const better = STATUS_RANK[found.status] > STATUS_RANK[existing.status] || (STATUS_RANK[found.status] === STATUS_RANK[existing.status] && found.kind === "founder" && existing.kind === "company");
  if (better) return { ...found, id: existing.id, isPreferred: existing.isPreferred, firstFoundAt: existing.firstFoundAt };
  return { ...existing, mxValid: found.mxValid ?? existing.mxValid, founderName: existing.founderName ?? found.founderName, founderId: existing.founderId ?? found.founderId };
}

export function mergeAll(existing: StoredContact[], found: ContactCandidate[], nowIso: string): StoredContact[] {
  const map = new Map(existing.map((c) => [contactKey(c), c]));
  for (const f of found) map.set(contactKey(f), mergeContact(map.get(contactKey(f)), f, nowIso));
  return [...map.values()];
}
