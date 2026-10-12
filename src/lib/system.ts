import { cache } from "react";
import { db } from "@/lib/supabase/admin";
import { hasSupabaseEnv } from "@/lib/env";
import { formatMinutes } from "@/lib/format";
import { sourceShortName } from "@/lib/labels";
import { computePipelineHealth, type RunLike } from "@/lib/pipeline/health";
import { nextGithubRun, nextScheduledRun, nextVercelRun, SCHEDULES } from "@/lib/pipeline/schedule";
import { needsAttention, sourceHealth, type SourceHealthLevel } from "@/lib/sources/health";

/**
 * Everything the app shell needs to show “System healthy · Last scan 34 min ago” and the system sheet.
 * Plain JSON (it is passed to client components). Never throws: a failing status query must not take the
 * page down, so it degrades to `level: "unknown"`.
 */
export interface SystemSummary {
  level: "healthy" | "delayed" | "warning" | "unknown";
  /** “System healthy · Last scan 34 min ago” */
  chip: string;
  reason: string;
  running: boolean;
  lastScanAt: string | null;
  lastScanAgo: string | null;
  lastSuccessAt: string | null;
  lastScheduledAt: string | null;
  nextExpectedAt: string | null;
  nextGithubAt: string;
  nextVercelAt: string;
  schedules: { github: string; vercel: string };
  latestFailure: { message: string; startedAt: string; trigger: string } | null;
  sources: { id: string; name: string; level: SourceHealthLevel; label: string; detail: string; attention: boolean }[];
  draftsToReview: number;
}

const CHIP: Record<SystemSummary["level"], string> = {
  healthy: "System healthy",
  delayed: "Scan running late",
  warning: "Needs attention",
  unknown: "Status unavailable",
};

export async function systemSummary(now: Date = new Date()): Promise<SystemSummary> {
  const base = {
    nextGithubAt: nextGithubRun(now).toISOString(),
    nextVercelAt: nextVercelRun(now).toISOString(),
    schedules: { github: SCHEDULES.github.label, vercel: SCHEDULES.vercel.label },
  };
  const unknown: SystemSummary = {
    ...base, level: "unknown", chip: CHIP.unknown, reason: "The system status could not be read.", running: false,
    lastScanAt: null, lastScanAgo: null, lastSuccessAt: null, lastScheduledAt: null, nextExpectedAt: null, latestFailure: null, sources: [], draftsToReview: 0,
  };
  if (!hasSupabaseEnv()) return unknown;
  try {
    const [runs, sources, drafts] = await Promise.all([
      db().from("pipeline_runs").select("id,status,trigger,started_at,completed_at,errors_json").order("started_at", { ascending: false }).limit(50),
      db().from("sources").select("id,name,enabled,last_polled_at,last_success_at,last_error,last_error_at").order("name"),
      db().from("outreach").select("id", { count: "exact", head: true }).in("status", ["generated", "draft_created"]),
    ]);
    if (runs.error) throw new Error(runs.error.message);
    const runRows = (runs.data ?? []) as RunLike[];
    const health = computePipelineHealth(runRows, now);
    const lastSuccessAt = health.lastSuccess ? (health.lastSuccess.completed_at ?? health.lastSuccess.started_at) : null;
    const lastScheduled = runRows.find((r) => r.trigger === "cron" && (r.status === "completed" || r.status === "partial"));
    const lastStarted = runRows[0]?.started_at ?? null;
    // Soonest tick of either scheduler.
    const nextExpectedAt = nextScheduledRun(now).toISOString();
    const srcs = (sources.data ?? []).map((s) => {
      const h = sourceHealth(s, now);
      return { id: s.id as string, name: sourceShortName(s.name as string), level: h.level, label: h.label, detail: h.detail, attention: needsAttention(h) };
    });
    return {
      ...base,
      level: health.level,
      chip: health.minutesSinceSuccess == null ? CHIP[health.level] : `${CHIP[health.level]} · Last scan ${formatMinutes(health.minutesSinceSuccess)} ago`,
      reason: health.reason,
      running: health.running,
      lastScanAt: lastStarted,
      lastScanAgo: health.minutesSinceSuccess == null ? null : formatMinutes(health.minutesSinceSuccess),
      lastSuccessAt,
      lastScheduledAt: lastScheduled ? (lastScheduled.completed_at ?? lastScheduled.started_at) : null,
      nextExpectedAt,
      latestFailure: health.latestFailure ? { message: health.latestFailure.message, startedAt: health.latestFailure.run.started_at, trigger: health.latestFailure.run.trigger } : null,
      sources: srcs,
      draftsToReview: drafts.count ?? 0,
    };
  } catch {
    return unknown;
  }
}

/** Request-scoped: the layout and the page can both ask without hitting the database twice. */
export const getSystemSummary = cache(() => systemSummary());
