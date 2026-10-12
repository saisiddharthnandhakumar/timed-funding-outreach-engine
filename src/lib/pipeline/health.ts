/**
 * Pipeline health, derived from `pipeline_runs`. Pure so it can be unit-tested.
 *
 * Cadence: GitHub Actions triggers a run roughly every 2 hours (Vercel Hobby only provides the daily
 * anchor run). GitHub scheduled workflows are occasionally delayed, hence the grace bands.
 */
export const EXPECTED_CADENCE_MINUTES = 120;
/** Up to cadence + 30 min is normal scheduler jitter. */
export const HEALTHY_MAX_MINUTES = EXPECTED_CADENCE_MINUTES + 30;
/** Up to 2.5× cadence is a delayed (probably late GitHub schedule) run; beyond it needs attention. */
export const DELAYED_MAX_MINUTES = EXPECTED_CADENCE_MINUTES * 2.5;

export type HealthLevel = "healthy" | "delayed" | "warning";

export interface RunLike {
  id: string;
  status: string;
  trigger: string;
  started_at: string;
  completed_at: string | null;
  errors_json?: unknown;
}

export interface PipelineHealth {
  level: HealthLevel;
  label: "Healthy" | "Delayed" | "Warning";
  reason: string;
  lastSuccess: RunLike | null;
  /** Minutes since the last successful run finished; null if there has never been one. */
  minutesSinceSuccess: number | null;
  running: boolean;
  latestFailure: { run: RunLike; message: string } | null;
}

/** A run that finished (completed, or partial = finished with some item-level errors) counts as a success. */
const isSuccess = (r: RunLike) => r.status === "completed" || r.status === "partial";

function failureMessage(run: RunLike): string {
  const errs = Array.isArray(run.errors_json) ? (run.errors_json as { scope?: string; message?: string }[]) : [];
  const first = errs[0];
  return first ? `${first.scope ?? "error"}: ${first.message ?? ""}`.trim() : "Run failed (no error detail recorded)";
}

/** `runs` must be ordered newest first (by started_at). */
export function computePipelineHealth(runs: RunLike[], now: Date = new Date()): PipelineHealth {
  const lastSuccess = runs.find(isSuccess) ?? null;
  const failedRun = runs.find((r) => r.status === "failed") ?? null;
  const running = runs.some((r) => r.status === "running");
  const latestFailure = failedRun ? { run: failedRun, message: failureMessage(failedRun) } : null;

  const minutesSinceSuccess = lastSuccess
    ? Math.max(0, Math.round((now.getTime() - new Date(lastSuccess.completed_at ?? lastSuccess.started_at).getTime()) / 60_000))
    : null;

  // Is the newest finished run a failure (i.e. the most recent attempt did not succeed)?
  const newestFinished = runs.find((r) => r.status !== "running");
  const lastAttemptFailed = newestFinished?.status === "failed";

  let level: HealthLevel;
  let reason: string;
  if (minutesSinceSuccess == null) {
    level = "warning";
    reason = "No successful pipeline run recorded yet.";
  } else if (minutesSinceSuccess > DELAYED_MAX_MINUTES) {
    level = "warning";
    reason = `No successful run for over ${Math.round(DELAYED_MAX_MINUTES / 60 * 10) / 10} hours (expected about every ${EXPECTED_CADENCE_MINUTES / 60} hours).`;
  } else if (lastAttemptFailed) {
    level = "warning";
    reason = "The most recent run failed.";
  } else if (minutesSinceSuccess > HEALTHY_MAX_MINUTES) {
    level = "delayed";
    reason = "Later than the expected cadence; GitHub Actions schedules can run late. Run manually if needed.";
  } else {
    level = "healthy";
    reason = "Runs are arriving on schedule.";
  }
  const label = level === "healthy" ? "Healthy" : level === "delayed" ? "Delayed" : "Warning";
  return { level, label, reason, lastSuccess, minutesSinceSuccess, running, latestFailure };
}

// Keep in sync with vercel.json (daily 03:30 UTC = 09:00 IST) and .github/workflows/pipeline-cron.yml (every 2 hours).
export const SCHEDULE = {
  vercel: { label: "Daily at 09:00 IST", cron: "30 3 * * *" },
  github: { label: "About every 2 hours", cron: "15 */2 * * *" },
} as const;

/** The one-line, scout-facing health sentence. */
export function describeHealth(h: Pick<PipelineHealth, "level" | "minutesSinceSuccess" | "running">): { level: HealthLevel; text: string } {
  const since = h.minutesSinceSuccess == null ? null : compact(h.minutesSinceSuccess);
  let text: string;
  if (h.level === "healthy") text = `System healthy · Last scan ${since} ago`;
  else if (h.level === "delayed") text = `Scan delayed · Last success ${since} ago`;
  else text = since == null ? "Discovery issue · No successful scan yet" : `Discovery issue · Last success ${since} ago`;
  if (h.running) text += " · Scanning now";
  return { level: h.level, text };
}

function compact(minutes: number): string {
  const m = Math.max(0, Math.round(minutes));
  if (m < 1) return "under 1m";
  if (m < 60) return `${m}m`;
  const h = Math.round(m / 60);
  return h < 48 ? `${h}h` : `${Math.round(h / 24)}d`;
}
