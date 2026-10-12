"use client";

import { useCallback, useEffect, useState } from "react";
import { overallPercent, type ProgressSnapshot, type StageProgress } from "@/lib/pipeline/progress";

export interface RunView {
  id: string;
  status: string;
  trigger: string;
  started_at: string;
  completed_at: string | null;
  errors_json?: { scope: string; message: string }[] | null;
  progress_json?: ProgressSnapshot | null;
}

const fmtDuration = (ms: number) => {
  const s = Math.max(0, Math.round(ms / 1000));
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, "0")}s`;
};

function StageIcon({ status }: { status: StageProgress["status"] }) {
  const base = "flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold";
  if (status === "done") return <span className={`${base} bg-emerald-500 text-white`} aria-label="done">✓</span>;
  if (status === "failed") return <span className={`${base} bg-rose-500 text-white`} aria-label="failed">✕</span>;
  if (status === "skipped") return <span className={`${base} border border-slate-300 text-slate-400`} aria-label="nothing to do">–</span>;
  if (status === "running")
    return (
      <span className={`${base} border-2 border-indigo-500 border-t-transparent`} aria-label="running">
        <span className="h-full w-full animate-spin rounded-full" />
      </span>
    );
  return <span className={`${base} border border-slate-300`} aria-label="waiting" />;
}

function Bar({ stage }: { stage: StageProgress }) {
  const pct = stage.status === "done" || stage.status === "skipped" ? 100 : stage.total > 0 ? Math.min(100, Math.round((stage.done / stage.total) * 100)) : 0;
  const color = stage.status === "failed" ? "bg-rose-500" : stage.status === "done" ? "bg-emerald-500" : stage.status === "skipped" ? "bg-slate-300" : "bg-indigo-500";
  const indeterminate = stage.status === "running" && stage.total === 0;
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}>
      <div className={`h-full rounded-full transition-all duration-500 ${color} ${indeterminate ? "w-1/3 animate-pulse" : ""}`} style={indeterminate ? undefined : { width: `${pct}%` }} />
    </div>
  );
}

export function PipelineProgress({ initial }: { initial: RunView | null }) {
  const [run, setRun] = useState<RunView | null>(initial);
  const [now, setNow] = useState(() => Date.now());
  const [startedAt, setStartedAt] = useState(0);

  const poll = useCallback(async () => {
    try {
      const res = await fetch("/api/pipeline/progress", { cache: "no-store" });
      if (res.ok) setRun(((await res.json()) as { run: RunView | null }).run);
    } catch {
      /* transient network error: try again on the next tick */
    }
  }, []);

  useEffect(() => {
    const onStart = () => {
      setStartedAt(Date.now());
      void poll();
    };
    window.addEventListener("pipeline-run-started", onStart);
    return () => window.removeEventListener("pipeline-run-started", onStart);
  }, [poll]);

  const active = run?.status === "running" || now - startedAt < 90_000;
  useEffect(() => {
    const id = setInterval(() => {
      setNow(Date.now());
      if (document.visibilityState === "visible") void poll();
    }, active ? 2000 : 15000);
    return () => clearInterval(id);
  }, [active, poll]);

  if (!run) {
    return <p className="text-sm text-slate-500">No pipeline run yet. Use “Run pipeline now”, or wait for the next scheduled run.</p>;
  }
  const progress = run.progress_json ?? null;
  const running = run.status === "running";
  const elapsed = (run.completed_at ? new Date(run.completed_at).getTime() : now) - new Date(run.started_at).getTime();
  const pct = progress ? (run.status === "running" ? overallPercent(progress) : 100) : 0;
  const errors = Array.isArray(run.errors_json) ? run.errors_json : [];

  return (
    <div className="space-y-5">
      <div>
        <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
          <div className="flex items-center gap-2">
            {running ? <span className="relative flex h-2.5 w-2.5"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-indigo-400 opacity-75" /><span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-indigo-500" /></span> : <span className={`h-2.5 w-2.5 rounded-full ${run.status === "failed" ? "bg-rose-500" : run.status === "partial" ? "bg-amber-500" : "bg-emerald-500"}`} />}
            <span className="font-medium text-slate-900">{running ? "Pipeline running" : `Last run ${run.status}`}</span>
            <span className="text-slate-500">· {run.trigger} · {fmtDuration(elapsed)}{running ? " elapsed" : ""}</span>
          </div>
          <span className="font-semibold tabular-nums text-slate-700">{pct}%</span>
        </div>
        <div className="mt-2 h-3 w-full overflow-hidden rounded-full bg-slate-100">
          <div className={`h-full rounded-full transition-all duration-700 ${run.status === "failed" ? "bg-rose-500" : running ? "bg-indigo-500" : "bg-emerald-500"}`} style={{ width: `${pct}%` }} />
        </div>
        {progress?.activity && (
          <p className="mt-2 flex items-center gap-2 text-sm text-slate-600">
            <span className="text-slate-400">{running ? "Now:" : "Last:"}</span> {progress.activity}
          </p>
        )}
      </div>

      {progress ? (
        <ol className="divide-y divide-slate-100">
          {progress.stages.map((s, i) => {
            const dur = s.startedAt ? (s.finishedAt ? new Date(s.finishedAt).getTime() : now) - new Date(s.startedAt).getTime() : null;
            return (
              <li key={s.key} className={`grid grid-cols-[1.5rem_1fr] gap-x-3 gap-y-1 py-3 ${s.status === "pending" ? "opacity-60" : ""}`}>
                <StageIcon status={s.status} />
                <div>
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                    <div className="text-sm font-medium text-slate-900">{i + 1}. {s.label}</div>
                    <div className="text-xs tabular-nums text-slate-500">
                      {s.status === "skipped" ? "nothing to do" : s.status === "pending" ? "waiting" : `${s.done} / ${s.total}`}
                      {dur != null && s.status !== "skipped" && <span className="ml-2 text-slate-400">{fmtDuration(dur)}</span>}
                    </div>
                  </div>
                  <div className="mt-1.5"><Bar stage={s} /></div>
                  <p className="mt-1 text-xs text-slate-500">{s.detail ?? s.hint}</p>
                </div>
              </li>
            );
          })}
        </ol>
      ) : (
        <p className="rounded-md bg-amber-50 p-3 text-sm text-amber-800">Per-stage progress isn’t available for this run. Apply the <code>pipeline_progress</code> migration to enable it.</p>
      )}

      {!running && errors.length > 0 && (
        <ul className="space-y-1 rounded-md bg-amber-50 p-3 text-xs text-amber-800">
          {errors.slice(0, 5).map((e, i) => <li key={i}><b>{e.scope}</b>: {e.message}</li>)}
        </ul>
      )}
    </div>
  );
}
