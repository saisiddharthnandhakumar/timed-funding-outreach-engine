import type { ProgressSnapshot, StageKey, StageStatus } from "./progress";

/**
 * The scout sees five plain steps; the pipeline has eight technical stages. This maps one onto the other
 * (the full 8-stage view stays available in Settings → System).
 */
export const SCAN_STEPS: { label: string; keys: StageKey[] }[] = [
  { label: "Scanning sources", keys: ["sources", "prefilter"] },
  { label: "Reviewing funding announcements", keys: ["classify", "filters"] },
  { label: "Researching candidates", keys: ["research", "contacts"] },
  { label: "Scoring fit", keys: ["scoring"] },
  { label: "Preparing drafts", keys: ["drafts"] },
];

export type StepStatus = "pending" | "running" | "done" | "failed";
export interface ScanStep {
  label: string;
  status: StepStatus;
}

function groupStatus(statuses: StageStatus[]): StepStatus {
  if (statuses.some((s) => s === "failed")) return "failed";
  if (statuses.every((s) => s === "done" || s === "skipped")) return "done";
  if (statuses.some((s) => s === "running" || s === "done")) return "running";
  return "pending";
}

export function scanSteps(progress: ProgressSnapshot | null | undefined): ScanStep[] {
  const byKey = new Map((progress?.stages ?? []).map((s) => [s.key, s.status]));
  return SCAN_STEPS.map((step) => ({ label: step.label, status: groupStatus(step.keys.map((k) => byKey.get(k) ?? "pending")) }));
}

/** The step to announce: the earliest one still in flight, else the first that has not started. */
export function currentStep(steps: ScanStep[]): ScanStep | null {
  return steps.find((s) => s.status === "running") ?? steps.find((s) => s.status === "pending") ?? null;
}
