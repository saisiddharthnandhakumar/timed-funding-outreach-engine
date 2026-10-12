/**
 * Scout-facing language for machine statuses. Machine codes stay untouched in the database and in the
 * pipeline; only the display layer goes through here.
 */

const sentence = (code: string) => {
  const t = code.replace(/_/g, " ").trim();
  return t ? t[0].toUpperCase() + t.slice(1) : "—";
};

const REJECTION: Record<string, string> = {
  below_threshold: "Not a fit",
  already_contacted: "Previously contacted",
  announcement_too_old: "Too old",
  wrong_stage: "Stage outside thesis",
  wrong_geography: "Outside target market",
  not_funding_announcement: "Not a funding announcement",
};
export const rejectionLabel = (code: string | null | undefined) => (code ? (REJECTION[code] ?? sentence(code)) : null);

/** `funding_rounds.status` */
const ROUND: Record<string, string> = {
  discovered: "New",
  enriching: "Reviewing",
  scored: "Scored",
  qualified: "Qualified",
  drafted: "Draft ready",
  rejected: "Filtered",
  error: "Needs a retry",
};
export const roundStatusLabel = (s: string | null | undefined) => (s ? (ROUND[s] ?? sentence(s)) : "—");

/** `funding_articles.processing_status` */
const ARTICLE: Record<string, string> = {
  pending: "Waiting for review",
  processing: "Reviewing",
  processed: "Reviewed",
  rejected: "Filtered",
  duplicate: "Duplicate coverage",
  error: "Couldn't be read",
};
export const articleStatusLabel = (s: string | null | undefined) => (s ? (ARTICLE[s] ?? sentence(s)) : "—");

/** Where a draft is in the scout's workflow. */
export type DraftState = "none" | "ready" | "approved" | "sent" | "rejected";

export function draftState(outreachStatus: string | null | undefined): DraftState {
  switch (outreachStatus) {
    case "generated":
    case "draft_created":
      return "ready";
    case "approved":
      return "approved";
    case "sent":
      return "sent";
    case "rejected":
    case "cancelled":
      return "rejected";
    default:
      return "none";
  }
}

export const DRAFT_STATE_LABEL: Record<DraftState, string> = {
  none: "No draft yet",
  ready: "Draft ready",
  approved: "Approved",
  sent: "Sent",
  rejected: "Dismissed",
};

export const NEXT_ACTION: Record<DraftState, string> = {
  none: "Open startup",
  ready: "Review draft",
  approved: "Send email",
  sent: "View thread",
  rejected: "Open startup",
};

/** `startup_contacts.verification_status` */
const VERIFICATION: Record<string, string> = {
  publicly_confirmed: "Published on their site",
  provider_verified: "Verified",
  domain_valid_only: "Domain checks out, mailbox unconfirmed",
  pattern_guessed: "Guessed from a pattern",
  unverified: "Unverified",
};
export const verificationLabel = (s: string | null | undefined) => (s ? (VERIFICATION[s] ?? sentence(s)) : "—");
export const isVerifiedContact = (s: string | null | undefined) => s === "publicly_confirmed" || s === "provider_verified";

/** `startups.contact_status` */
const CONTACT: Record<string, string> = {
  pending: "Not searched yet",
  in_progress: "Searching",
  completed: "Contact found",
  not_found: "No reliable contact found",
  failed: "Search failed",
};
export const contactStatusLabel = (s: string | null | undefined) => (s ? (CONTACT[s] ?? sentence(s)) : "—");

/** `startups.enrichment_status` */
const RESEARCH: Record<string, string> = {
  pending: "Queued",
  in_progress: "Researching",
  completed: "Researched",
  failed: "Research failed",
  skipped: "Skipped",
};
export const researchStatusLabel = (s: string | null | undefined) => (s ? (RESEARCH[s] ?? sentence(s)) : "—");

/** `pipeline_runs.status` */
const RUN: Record<string, string> = { running: "Scanning", completed: "Completed", partial: "Completed with warnings", failed: "Failed" };
export const runStatusLabel = (s: string | null | undefined) => (s ? (RUN[s] ?? sentence(s)) : "—");

export const prettyCode = sentence;
