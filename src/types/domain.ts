export const FUNDING_STAGES = [
  "pre-seed",
  "seed",
  "pre-series-a",
  "series-a",
  "series-b",
  "series-c-plus",
  "bridge",
  "debt",
  "grant",
  "ipo",
  "unknown",
] as const;
export type FundingStage = (typeof FUNDING_STAGES)[number];

export const STAGE_LABELS: Record<FundingStage, string> = {
  "pre-seed": "Pre-seed",
  seed: "Seed",
  "pre-series-a": "Pre-Series A",
  "series-a": "Series A",
  "series-b": "Series B",
  "series-c-plus": "Series C+",
  bridge: "Bridge",
  debt: "Debt",
  grant: "Grant",
  ipo: "IPO / public",
  unknown: "Unknown",
};

export type RejectionReason =
  | "not_funding_announcement"
  | "wrong_geography"
  | "wrong_stage"
  | "announcement_too_old"
  | "already_contacted"
  | "below_threshold";

export interface ThesisRow {
  id: string;
  name: string;
  description: string | null;
  natural_language_thesis: string;
  active: boolean;
  version: number;
  allowed_countries: string[];
  allowed_stages: string[];
  included_sectors: string[];
  preferred_subsectors: string[];
  excluded_sectors: string[];
  preferred_business_models: string[];
  max_announcement_age_hours: number;
  minimum_fit_score: number;
  recency_bands: RecencyBand[];
  stage_points: Record<string, number>;
  created_at: string;
}

export interface RecencyBand {
  max_hours: number;
  points: number;
}

export interface CriterionRow {
  id?: string;
  thesis_id?: string;
  criterion_key: string;
  display_name: string;
  description: string;
  weight: number;
  enabled: boolean;
  sort_order: number;
}

export interface SourceRow {
  id: string;
  key: string;
  name: string;
  type: string;
  base_url: string;
  feed_url: string | null;
  enabled: boolean;
  poll_interval_minutes: number;
  last_polled_at: string | null;
  last_success_at: string | null;
  last_items_found: number;
  last_error: string | null;
  last_error_at: string | null;
  /** Added by the discovery/enrichment extension; absent on rows read before it. */
  source_type?: string | null;
  source_role?: string[] | null;
  adapter_status?: string | null;
  status_note?: string | null;
  config_json?: Record<string, unknown> | null;
}
