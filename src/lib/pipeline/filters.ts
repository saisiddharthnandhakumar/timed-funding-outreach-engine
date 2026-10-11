import type { RejectionReason } from "@/types/domain";
import { hoursBetween } from "@/lib/util/text";

export interface HardFilterConfig {
  allowed_countries: string[];
  allowed_stages: string[];
  max_announcement_age_hours: number;
}

export interface HardFilterInput {
  isFundingAnnouncement: boolean;
  isIndianStartup: boolean | null;
  hqCountry: string | null;
  stage: string;
  /** Source publish time if known, else our first_seen_at (documented fallback). */
  announcedAt: Date;
  now: Date;
  /** undefined = not checked yet (pre-deduplication pass). */
  alreadyContacted?: boolean;
  /**
   * When true, a completely unknown country (no HQ, no Indian-startup verdict) does not fail
   * the geography check yet; it is re-verified against research before scoring.
   */
  deferUnknownGeography?: boolean;
}

export interface HardFilterResult {
  passed: boolean;
  reason: RejectionReason | null;
  ageHours: number;
  checks: Record<string, boolean | null>;
}

const COUNTRY_ALIASES: Record<string, string> = { in: "india", ind: "india", bharat: "india", "republic of india": "india" };
const norm = (s: string) => {
  const k = s.trim().toLowerCase();
  return COUNTRY_ALIASES[k] ?? k;
};

/**
 * Geography passes if the extracted HQ country is an allowed country; when the
 * country is unknown, an explicit "Indian startup" verdict is accepted only if
 * India is an allowed country (so the rule keeps working if the thesis changes).
 */
export function passesGeography(cfg: HardFilterConfig, input: Pick<HardFilterInput, "hqCountry" | "isIndianStartup">): boolean {
  const allowed = new Set(cfg.allowed_countries.map(norm));
  if (allowed.size === 0) return true;
  if (input.hqCountry) return allowed.has(norm(input.hqCountry));
  return input.isIndianStartup === true && allowed.has("india");
}

export function evaluateHardFilters(cfg: HardFilterConfig, input: HardFilterInput): HardFilterResult {
  const ageHours = hoursBetween(input.now, input.announcedAt);
  const checks = {
    funding_announcement: input.isFundingAnnouncement,
    geography: passesGeography(cfg, input) || (input.deferUnknownGeography === true && input.hqCountry == null && input.isIndianStartup == null),
    stage: cfg.allowed_stages.map((s) => s.toLowerCase()).includes(input.stage.toLowerCase()),
    recency: ageHours <= cfg.max_announcement_age_hours,
    not_contacted: input.alreadyContacted === undefined ? null : !input.alreadyContacted,
  };
  let reason: RejectionReason | null = null;
  if (!checks.funding_announcement) reason = "not_funding_announcement";
  else if (!checks.geography) reason = "wrong_geography";
  else if (!checks.stage) reason = "wrong_stage";
  else if (!checks.recency) reason = "announcement_too_old";
  else if (checks.not_contacted === false) reason = "already_contacted";
  return { passed: reason === null, reason, ageHours, checks };
}
