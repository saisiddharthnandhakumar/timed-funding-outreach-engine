import type { FoundEmail } from "./extract";
import { localPartMatches, nameParts, registrableDomain, sameCompanyDomain, textMentionsName } from "./names";
import type { ContactCandidate, DiscoverySource, FounderRef, MailboxRole, VerificationStatus } from "./types";

export interface Attribution {
  founder: FounderRef | null;
  /** Why we believe the address belongs to this founder / company. */
  evidence: string;
  strength: "strong" | "medium";
}

const GENERAL = /^(hello|hi|hey|contact|contactus|info|team|business|biz|connect|reach|reachus|enquiries|enquiry|inquiries|inquiry|office|admin|founders?|partnerships?|partners?|collab|collaborations?)$/i;
const PARTNER = /^(partnerships?|partners?|collab|collaborations?|business|biz|founders?)$/i;
const PRESS = /^(press|media|pr|sales|marketing|investors?|ir)$/i;
const SUPPORT = /^(support|help|care|customercare|customer[-_.]?support|service|helpdesk|careers?|jobs|hr|recruit(?:ment)?|talent|billing|accounts?)$/i;

export function mailboxRole(local: string): MailboxRole {
  if (PARTNER.test(local)) return "partnerships";
  if (GENERAL.test(local)) return "general";
  if (PRESS.test(local)) return "press";
  if (SUPPORT.test(local)) return "support";
  return "other";
}

/**
 * Decide whether a published address belongs to a specific founder.
 * Returns null when there is no sufficient evidence (the caller may still treat it as a company address).
 */
export function attributeToFounder(found: FoundEmail, founders: FounderRef[], companyDomain: string | null): Attribution | null {
  const [local, domain] = found.email.split("@");

  // schema.org Person with a matching name is explicit structured evidence.
  if (found.personName) {
    const f = founders.find((x) => textMentionsName(found.personName!, x.name) || textMentionsName(x.name, found.personName!));
    if (f) return { founder: f, evidence: `Structured data (schema.org Person "${found.personName}") lists this address`, strength: "strong" };
  }

  const mentioned = founders.filter((f) => textMentionsName(found.context, f.name));
  if (mentioned.length === 1) {
    const f = mentioned[0];
    const lm = localPartMatches(local, f.name);
    // A lone name next to the address is good evidence, unless the local part clearly names someone else.
    if (lm || !founders.some((o) => o !== f && localPartMatches(local, o.name))) {
      return { founder: f, evidence: `"${f.name}" appears next to this published address${lm ? " and the mailbox name matches" : ""}`, strength: "strong" };
    }
  }
  if (mentioned.length > 1) {
    const hit = mentioned.find((f) => localPartMatches(local, f.name));
    if (hit) return { founder: hit, evidence: `Mailbox name matches "${hit.name}" (several founders listed near it)`, strength: "strong" };
    return null; // ambiguous team grid: cannot say whose it is
  }

  // No name in context: rely on the mailbox name, but only on the company's own domain.
  if (sameCompanyDomain(domain, companyDomain)) {
    const matches = founders.map((f) => ({ f, m: localPartMatches(local, f.name) })).filter((x) => x.m);
    const full = matches.filter((x) => x.m === "full");
    if (full.length === 1) return { founder: full[0].f, evidence: `Published on the company site; mailbox name matches "${full[0].f.name}"`, strength: "medium" };
    const firstOnly = matches.filter((x) => x.m === "first");
    if (matches.length === 1 && firstOnly.length === 1) {
      const firstName = nameParts(firstOnly[0].f.name)!.first;
      const sharing = founders.filter((x) => nameParts(x.name)?.first === firstName).length;
      if (sharing === 1) return { founder: firstOnly[0].f, evidence: `Published on the company site; mailbox "${local}@" matches the founder's first name`, strength: "medium" };
    }
  }
  return null;
}

export interface ClassifyInput {
  found: FoundEmail;
  founders: FounderRef[];
  companyDomain: string | null;
  source: DiscoverySource;
  sourceUrl: string;
  /** Page belongs to the company's own website. */
  officialSite: boolean;
}

/**
 * Turn a published address into a (not yet MX-checked) candidate, or null when it is neither attributable to
 * a founder nor on the company's own domain.
 */
export function classifyFoundEmail(i: ClassifyInput): ContactCandidate | null {
  const domain = i.found.email.split("@")[1];
  const local = i.found.email.split("@")[0];
  const attribution = attributeToFounder(i.found, i.founders, i.companyDomain);
  const onCompanyDomain = sameCompanyDomain(domain, i.companyDomain);

  if (attribution?.founder) {
    let status: VerificationStatus;
    if (i.officialSite || (onCompanyDomain && attribution.strength === "strong") || i.source === "github") status = "publicly_confirmed";
    else status = "domain_valid_only";
    return {
      kind: "founder", email: i.found.email, contactUrl: null, founderId: attribution.founder.id, founderName: attribution.founder.name, mailboxRole: null,
      status, source: i.source, sourceUrl: i.sourceUrl, evidence: attribution.evidence, mxValid: null,
      confidence: status === "publicly_confirmed" ? (attribution.strength === "strong" ? 90 : 75) : 40,
    };
  }
  if (onCompanyDomain) {
    const role = mailboxRole(local);
    const status: VerificationStatus = i.officialSite ? "publicly_confirmed" : "domain_valid_only";
    return {
      kind: "company", email: i.found.email, contactUrl: null, founderId: null, founderName: null, mailboxRole: role,
      status, source: i.source, sourceUrl: i.sourceUrl, evidence: i.officialSite ? "Published on the official company website" : "Seen on a third-party page", mxValid: null,
      confidence: status === "publicly_confirmed" ? 80 : 40,
    };
  }
  return null;
}

export { registrableDomain };
