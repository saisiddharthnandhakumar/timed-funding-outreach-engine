"use client";

import { overallPercent, type StageKey } from "@/lib/pipeline/progress";
import { usePipelineRun, type RunView } from "./use-pipeline-run";

/** Scout-facing phases. Internal stage names (and anything about models or functions) never appear here. */
const PHASES: { label: string; keys: StageKey[] }[] = [
  { label: "Scanning sources…", keys: ["sources", "prefilter"] },
  { label: "Reviewing funding announcements…", keys: ["classify", "filters"] },
  { label: "Researching candidates…", keys: ["research"] },
  { label: "Scoring fit…", keys: ["scoring"] },
  { label: "Preparing drafts…", keys: ["contacts", "drafts"] },
];

/** Friendly progress for a running scan. Renders nothing when no scan is running. */
export function ScanStatus({ enabled = true }: { enabled?: boolean }) {
  const { run, active } = usePipelineRun(null, enabled);
  if (!run || run.status !== "running" || !active) return null;
  const stages = run.progress_json?.stages ?? [];
  const phaseDone = (keys: StageKey[]) => stages.length > 0 && keys.every((k) => ["done", "skipped"].includes(stages.find((s) => s.key === k)?.status ?? "pending"));
  const currentIdx = Math.max(0, PHASES.findIndex((p) => !phaseDone(p.keys)));
  const pct = run.progress_json ? overallPercent(run.progress_json) : 0;

  return (
    <div role="status" aria-live="polite" className="rounded-lg bg-sunken p-4">
      <div className="flex items-center justify-between gap-3 text-sm">
        <span className="font-medium text-ink">{PHASES[currentIdx].label}</span>
        <span className="num text-faint">{pct}%</span>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-line" role="progressbar" aria-label="Scan progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}>
        <div className="h-full rounded-full bg-accent transition-all duration-700" style={{ width: `${Math.max(pct, 4)}%` }} />
      </div>
      <ol className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-faint">
        {PHASES.map((p, i) => (
          <li key={p.label} className={i === currentIdx ? "font-medium text-ink" : ""}>
            {i < currentIdx ? "✓ " : ""}{p.label.replace("…", "")}
            <span className="sr-only">{i < currentIdx ? " (done)" : i === currentIdx ? " (in progress)" : " (waiting)"}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

export type { RunView };
