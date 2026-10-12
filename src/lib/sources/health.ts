/**
 * Human source health. Pure. Uses the same cadence bands as the pipeline health
 * (`lib/pipeline/health.ts`): runs arrive about every 2 hours, so a source that last succeeded within
 * 150 minutes is healthy, within 300 delayed, beyond that it needs attention.
 */
import { DELAYED_MAX_MINUTES, HEALTHY_MAX_MINUTES } from "@/lib/pipeline/health";

export type SourceHealthLevel = "healthy" | "delayed" | "attention" | "paused" | "waiting";

export interface SourceLike {
  enabled: boolean;
  last_polled_at: string | null;
  last_success_at: string | null;
  last_error: string | null;
  last_error_at: string | null;
}

export interface SourceHealth {
  level: SourceHealthLevel;
  label: string;
  /** One plain sentence, e.g. “Hasn’t updated successfully in 4 hours.” */
  detail: string;
  minutesSinceSuccess: number | null;
  /** The most recent check failed (as opposed to simply being a little late). */
  failing: boolean;
}

function span(mins: number): string {
  if (mins < 90) return `${mins} minutes`;
  const h = mins / 60;
  return h < 48 ? `${Math.round(h)} hours` : `${Math.round(h / 24)} days`;
}

export function sourceHealth(s: SourceLike, now: Date = new Date()): SourceHealth {
  if (!s.enabled) return { level: "paused", label: "Paused", detail: "Turned off. It is not being checked.", minutesSinceSuccess: null, failing: false };
  if (!s.last_success_at) {
    return s.last_error
      ? { level: "attention", label: "Needs attention", detail: "Has never updated successfully.", minutesSinceSuccess: null, failing: true }
      : { level: "waiting", label: "Waiting", detail: "Not checked yet. It will be picked up on the next scan.", minutesSinceSuccess: null, failing: false };
  }
  const mins = Math.max(0, Math.round((now.getTime() - new Date(s.last_success_at).getTime()) / 60_000));
  const failingSince = s.last_error && s.last_error_at && new Date(s.last_error_at) > new Date(s.last_success_at);
  if (mins > DELAYED_MAX_MINUTES) return { level: "attention", label: "Needs attention", detail: `Hasn’t updated successfully in ${span(mins)}.`, minutesSinceSuccess: mins, failing: !!failingSince };
  if (failingSince || mins > HEALTHY_MAX_MINUTES) {
    return { level: "delayed", label: "Delayed", detail: failingSince ? `The latest check failed; last success ${span(mins)} ago.` : `Last updated ${span(mins)} ago.`, minutesSinceSuccess: mins, failing: !!failingSince };
  }
  return { level: "healthy", label: "Healthy", detail: `Updated ${mins < 1 ? "just now" : `${span(mins)} ago`}.`, minutesSinceSuccess: mins, failing: false };
}

/** Worth interrupting the scout for: stale for hours, or the latest check actually failed. A late-but-fine source is not. */
export const needsAttention = (h: SourceHealth) => h.level === "attention" || (h.level === "delayed" && h.failing);
