/**
 * Human vocabulary for machine statuses. The database keeps its codes; this is the only place where
 * they are translated for the scout. Every label has a tone so the UI can pair text with a dot colour
 * (colour is never the only carrier of meaning: the text is always shown).
 */
export type Tone = "neutral" | "positive" | "caution" | "negative" | "accent";
export interface Label {
  text: string;
  tone: Tone;
}

const L = (text: string, tone: Tone = "neutral"): Label => ({ text, tone });
export const humanize = (code: string) => {
  const s = code.replace(/_/g, " ").trim();
  return s.charAt(0).toUpperCase() + s.slice(1);
};

const REJECTION: Record<string, string> = {
  below_threshold: "Not a fit",
  already_contacted: "Previously contacted",
  announcement_too_old: "Too old",
  wrong_stage: "Stage outside thesis",
  wrong_geography: "Outside target market",
  not_funding_announcement: "Not a funding announcement",
};

export const rejectionLabel = (code: string | null | undefined): string => (code ? (REJECTION[code] ?? humanize(code)) : "Not a fit");

/** A funding event (funding_rounds.status + rejection_reason). */
export function roundLabel(status: string | null | undefined, rejectionReason?: string | null): Label {
  switch (status) {
    case "qualified":
      return L("Qualified", "positive");
    case "drafted":
      return L("Draft ready", "positive");
    case "scored":
      return L("Scored", "accent");
    case "enriching":
      return L("Researching", "accent");
    case "discovered":
      return L("Reviewing", "accent");
    case "rejected":
      return rejectionReason === "already_contacted" ? L("Previously contacted") : L(rejectionLabel(rejectionReason));
    case "error":
      return L("Will retry", "caution");
    default:
      return L(status ? humanize(status) : "—");
  }
}

/** A raw article (funding_articles.processing_status + rejection_reason). */
export function articleLabel(status: string | null | undefined, rejectionReason?: string | null): Label {
  switch (status) {
    case "pending":
      return L("Reviewing", "accent");
    case "processed":
      return L("Reviewed");
    case "duplicate":
      return L("Duplicate");
    case "error":
      return L("Couldn’t read", "caution");
    case "rejected":
      return L(rejectionReason ? rejectionLabel(rejectionReason) : "Not relevant");
    default:
      return L(status ? humanize(status) : "—");
  }
}

/** An outreach draft (outreach.status). */
export function draftLabel(status: string | null | undefined): Label {
  switch (status) {
    case "generated":
    case "draft_created":
      return L("Needs review", "accent");
    case "approved":
      return L("Approved", "positive");
    case "sent":
      return L("Sent", "neutral");
    case "rejected":
      return L("Rejected");
    case "cancelled":
      return L("Cancelled");
    default:
      return L("No draft");
  }
}

export function researchLabel(status: string | null | undefined): Label {
  switch (status) {
    case "completed":
      return L("Researched", "positive");
    case "in_progress":
      return L("Researching", "accent");
    case "failed":
      return L("Research failed", "negative");
    case "skipped":
      return L("Not researched");
    default:
      return L("Waiting");
  }
}

export function contactSearchLabel(status: string | null | undefined): Label {
  switch (status) {
    case "completed":
      return L("Contact found", "positive");
    case "in_progress":
      return L("Searching", "accent");
    case "not_found":
      return L("No contact found", "caution");
    case "failed":
      return L("Search failed", "negative");
    default:
      return L("Not searched yet");
  }
}

export function verificationLabel(status: string | null | undefined): Label {
  switch (status) {
    case "publicly_confirmed":
      return L("Published by the company", "positive");
    case "provider_verified":
      return L("Verified", "positive");
    case "domain_valid_only":
      return L("Mail domain only", "caution");
    case "pattern_guessed":
      return L("Guessed, not used", "caution");
    case "unverified":
      return L("Unverified", "caution");
    default:
      return L(status ? humanize(status) : "—");
  }
}

export function runLabel(status: string | null | undefined): Label {
  switch (status) {
    case "completed":
      return L("Completed", "positive");
    case "partial":
      return L("Completed with issues", "caution");
    case "failed":
      return L("Failed", "negative");
    case "running":
      return L("Running", "accent");
    case "skipped":
      return L("Skipped");
    default:
      return L(status ? humanize(status) : "—");
  }
}

/** “Inc42 — Buzz” → “Inc42”. The feed suffix is an engineering detail; the full name stays in technical views. */
export const sourceShortName = (name: string | null | undefined): string => (name ?? "").split(/\s+[—–]\s+/)[0].trim();

export const SOURCE_KIND: Record<string, string> = {
  company_website: "Company website",
  source_article: "News article",
  search_citation: "Web citation",
  search_grounding: "Web search",
};
export const sourceKindLabel = (kind: string) => SOURCE_KIND[kind] ?? humanize(kind);
