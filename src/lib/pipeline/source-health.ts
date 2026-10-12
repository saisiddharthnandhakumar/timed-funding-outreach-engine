import { DELAYED_MAX_MINUTES, HEALTHY_MAX_MINUTES } from "./health";

export type SourceLevel = "healthy" | "delayed" | "issue" | "paused" | "idle";

export interface SourceLike {
  enabled: boolean;
  last_polled_at: string | null;
  last_success_at: string | null;
  last_error: string | null;
  last_error_at: string | null;
  /** How often this source is meant to be polled. Absent = the pipeline cadence. */
  poll_interval_minutes?: number | null;
}

export const SOURCE_LEVEL_LABEL: Record<SourceLevel, string> = { healthy: "Healthy", delayed: "Delayed", issue: "Issue", paused: "Paused", idle: "Not polled yet" };

/**
 * One word per source. Uses the same cadence thresholds as the pipeline health, so a source never looks
 * unhealthy while the pipeline itself is considered on schedule.
 */
export function sourceHealth(s: SourceLike, now = new Date()): SourceLevel {
  if (!s.enabled) return "paused";
  if (!s.last_polled_at && !s.last_success_at) return "idle";
  const errorIsLatest = Boolean(s.last_error) && (!s.last_success_at || (s.last_error_at != null && new Date(s.last_error_at) >= new Date(s.last_success_at)));
  if (errorIsLatest) return "issue";
  if (!s.last_success_at) return "issue";
  const minutes = (now.getTime() - new Date(s.last_success_at).getTime()) / 60_000;
  // A source polled daily (investor sites) isn't late after 3 hours; scale by its own interval. For the 120-minute news
  // sources these resolve to exactly the existing 150 / 300 minute limits.
  const interval = s.poll_interval_minutes ?? 0;
  const healthyMax = Math.max(HEALTHY_MAX_MINUTES, interval * 1.25);
  const delayedMax = Math.max(DELAYED_MAX_MINUTES, interval * 2.5);
  if (minutes <= healthyMax) return "healthy";
  if (minutes <= delayedMax) return "delayed";
  return "issue";
}
