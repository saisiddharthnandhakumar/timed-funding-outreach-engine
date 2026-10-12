"use client";

import { overallPercent, type StageProgress } from "@/lib/pipeline/progress";
import { usePipelineRun, type RunView } from "./use-pipeline-run";

export type { RunView };

const fmtDuration = (ms: number) => {
  const s = Math.max(0, Math.round(ms / 1000));
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, "0")}s`;
};

const STATUS_WORD: Record<StageProgress["status"], string> = { done: "Done", failed: "Failed", skipped: "Nothing to do", running: "Running", pending: "Waiting" };

function Bar({ stage }: { stage: StageProgress }) {
  const pct = stage.status === "done" || stage.status === "skipped" ? 100 : stage.total > 0 ? Math.min(100, Math.round((stage.done / stage.total) * 100)) : 0;
  const color = stage.status === "failed" ? "bg-bad" : stage.status === "done" ? "bg-ok" : stage.status === "skipped" ? "bg-field" : "bg-accent";
  const indeterminate = stage.status === "running" && stage.total === 0;
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-sunken" role="progressbar" aria-label={stage.label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}>
      <div className={`h-full rounded-full transition-all duration-500 ${color} ${indeterminate ? "w-1/3 animate-pulse" : ""}`} style={indeterminate ? undefined : { width: `${pct}%` }} />
    </div>
  );
}

/** Technical, per-stage pipeline view. Lives under Settings → System. */
export function PipelineProgress({ initial }: { initial: RunView | null }) {
  const { run, now } = usePipelineRun(initial);

  if (!run) return <p className="text-sm text-muted">No pipeline run yet. Use “Run pipeline now”, or wait for the next scheduled run.</p>;
  const progress = run.progress_json ?? null;
  const running = run.status === "running";
  const elapsed = (run.completed_at ? new Date(run.completed_at).getTime() : now) - new Date(run.started_at).getTime();
  const pct = progress ? (running ? overallPercent(progress) : 100) : 0;
  const errors = Array.isArray(run.errors_json) ? run.errors_json : [];

  return (
    <div className="space-y-5">
      <div>
        <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
          <div className="font-medium text-ink">
            {running ? "Pipeline running" : `Last run: ${run.status}`}
            <span className="font-normal text-muted"> · {run.trigger} · {fmtDuration(elapsed)}{running ? " elapsed" : ""}</span>
          </div>
          <span className="num font-semibold text-ink">{pct}%</span>
        </div>
        <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-sunken">
          <div className={`h-full rounded-full transition-all duration-700 ${run.status === "failed" ? "bg-bad" : running ? "bg-accent" : "bg-ok"}`} style={{ width: `${pct}%` }} />
        </div>
        {progress?.activity && <p className="mt-2 text-sm text-muted"><span className="text-faint">{running ? "Now: " : "Last: "}</span>{progress.activity}</p>}
      </div>

      {progress ? (
        <ol className="divide-y divide-line">
          {progress.stages.map((s, i) => {
            const dur = s.startedAt ? (s.finishedAt ? new Date(s.finishedAt).getTime() : now) - new Date(s.startedAt).getTime() : null;
            return (
              <li key={s.key} className={`py-3 ${s.status === "pending" ? "opacity-70" : ""}`}>
                <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                  <div className="text-sm font-medium text-ink">{i + 1}. {s.label}</div>
                  <div className="num text-xs text-faint">
                    {STATUS_WORD[s.status]}
                    {s.status !== "skipped" && s.status !== "pending" && ` · ${s.done} / ${s.total}`}
                    {dur != null && s.status !== "skipped" && ` · ${fmtDuration(dur)}`}
                  </div>
                </div>
                <div className="mt-1.5"><Bar stage={s} /></div>
                <p className="mt-1 text-xs text-faint">{s.detail ?? s.hint}</p>
              </li>
            );
          })}
        </ol>
      ) : (
        <p className="rounded-lg bg-warn-soft p-3 text-sm text-ink">Per-stage progress isn’t available for this run. Apply the <code>pipeline_progress</code> migration to enable it.</p>
      )}

      {!running && errors.length > 0 && (
        <ul className="space-y-1 rounded-lg bg-warn-soft p-3 text-xs text-ink">
          {errors.slice(0, 5).map((e, i) => <li key={i}><b>{e.scope}</b>: {e.message}</li>)}
        </ul>
      )}
    </div>
  );
}
