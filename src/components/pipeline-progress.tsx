"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { overallPercent, type ProgressSnapshot, type StageProgress } from "@/lib/pipeline/progress";
import { currentStep, scanSteps } from "@/lib/pipeline/steps";
import { runLabel } from "@/lib/labels";
import { CheckIcon } from "./icons";
import { Callout, StatusLabel, cx } from "./ui";

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

/** Polls the latest run. Fast while a run is active (or was just started here), slow otherwise. */
function usePipelineRun(initial: RunView | null) {
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

  return { run, now };
}

/* ─── Today: five plain steps, only while something is happening ───────────────────────────── */
export function ScanBanner({ initial }: { initial: RunView | null }) {
  const router = useRouter();
  const { run } = usePipelineRun(initial);
  const [open, setOpen] = useState(false);
  const wasRunning = useRef(initial?.status === "running");

  const running = run?.status === "running";
  useEffect(() => {
    // A scan just finished: pull in the new opportunities.
    if (wasRunning.current && !running) router.refresh();
    wasRunning.current = running;
  }, [running, router]);

  if (!run || !running) return null;
  const steps = scanSteps(run.progress_json);
  const current = currentStep(steps);
  return (
    <div className="mb-8 rounded-lg bg-sunken px-4 py-3" role="status" aria-live="polite">
      <div className="flex items-center justify-between gap-4">
        <p className="flex items-center gap-2.5 text-body text-ink">
          <span className="relative flex size-2.5"><span className="absolute inline-flex size-full animate-ping rounded-full bg-accent opacity-60" /><span className="relative inline-flex size-2.5 rounded-full bg-accent" /></span>
          {current ? `${current.label}…` : "Scanning…"}
        </p>
        <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="rounded-md px-2 py-1 text-meta text-ink-2 hover:bg-line/60">
          {open ? "Hide steps" : "Show steps"}
        </button>
      </div>
      <div className="mt-3 grid grid-cols-5 gap-1.5" aria-hidden="true">
        {steps.map((s) => <span key={s.label} className={cx("h-1 rounded-full transition-colors duration-500", s.status === "done" ? "bg-accent" : s.status === "running" ? "animate-pulse bg-accent/50" : s.status === "failed" ? "bg-bad" : "bg-line-strong")} />)}
      </div>
      {open && (
        <ol className="mt-4 space-y-2">
          {steps.map((s) => (
            <li key={s.label} className="flex items-center gap-2.5 text-meta text-ink-2">
              <span className={cx("grid size-4 place-items-center rounded-full", s.status === "done" ? "bg-accent text-accent-ink" : "border border-line-strong")}>
                {s.status === "done" && <CheckIcon width={10} height={10} strokeWidth={2.4} />}
              </span>
              <span className={cx(s.status === "pending" && "text-ink-3")}>{s.label}</span>
              {s.status === "running" && <span className="text-ink-3">in progress</span>}
              {s.status === "failed" && <span className="text-bad">needs attention</span>}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

/* ─── Settings → System: the full eight-stage view ─────────────────────────────────────────── */
function StageIcon({ status }: { status: StageProgress["status"] }) {
  const base = "grid size-6 shrink-0 place-items-center rounded-full text-label font-semibold";
  if (status === "done") return <span className={`${base} bg-ok text-bg`} aria-label="done">✓</span>;
  if (status === "failed") return <span className={`${base} bg-bad text-bg`} aria-label="failed">✕</span>;
  if (status === "skipped") return <span className={`${base} border border-line-strong text-ink-3`} aria-label="nothing to do">–</span>;
  if (status === "running") return <span className={`${base} border-2 border-accent border-t-transparent`} aria-label="running"><span className="size-full animate-spin rounded-full" /></span>;
  return <span className={`${base} border border-line-strong`} aria-label="waiting" />;
}

function Bar({ stage }: { stage: StageProgress }) {
  const pct = stage.status === "done" || stage.status === "skipped" ? 100 : stage.total > 0 ? Math.min(100, Math.round((stage.done / stage.total) * 100)) : 0;
  const color = stage.status === "failed" ? "bg-bad" : stage.status === "done" ? "bg-ok" : stage.status === "skipped" ? "bg-line-strong" : "bg-accent";
  const indeterminate = stage.status === "running" && stage.total === 0;
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-sunken" role="progressbar" aria-label={stage.label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}>
      <div className={`h-full rounded-full transition-all duration-500 ${color} ${indeterminate ? "w-1/3 animate-pulse" : ""}`} style={indeterminate ? undefined : { width: `${pct}%` }} />
    </div>
  );
}

export function PipelineProgress({ initial }: { initial: RunView | null }) {
  const { run, now } = usePipelineRun(initial);

  if (!run) return <p className="text-body text-ink-2">No scan has run yet. Use “Scan now”, or wait for the next scheduled scan.</p>;
  const progress = run.progress_json ?? null;
  const running = run.status === "running";
  const elapsed = (run.completed_at ? new Date(run.completed_at).getTime() : now) - new Date(run.started_at).getTime();
  const pct = progress ? (running ? overallPercent(progress) : 100) : 0;
  const errors = Array.isArray(run.errors_json) ? run.errors_json : [];

  return (
    <div className="space-y-5">
      <div>
        <div className="flex flex-wrap items-center justify-between gap-2 text-body">
          <div className="flex items-center gap-3">
            <StatusLabel label={runLabel(run.status)} />
            <span className="text-meta text-ink-3">{run.trigger === "cron" ? "scheduled" : run.trigger} · {fmtDuration(elapsed)}{running ? " elapsed" : ""}</span>
          </div>
          <span className="text-meta font-medium tabular-nums text-ink-2">{pct}%</span>
        </div>
        <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-sunken">
          <div className={cx("h-full rounded-full transition-all duration-700", run.status === "failed" ? "bg-bad" : running ? "bg-accent" : "bg-ok")} style={{ width: `${pct}%` }} />
        </div>
        {progress?.activity && <p className="mt-2 text-meta text-ink-2"><span className="text-ink-3">{running ? "Now: " : "Last: "}</span>{progress.activity}</p>}
      </div>

      {progress ? (
        <ol className="divide-y divide-line">
          {progress.stages.map((s, i) => {
            const dur = s.startedAt ? (s.finishedAt ? new Date(s.finishedAt).getTime() : now) - new Date(s.startedAt).getTime() : null;
            return (
              <li key={s.key} className={`grid grid-cols-[1.5rem_1fr] gap-x-3 gap-y-1 py-3 ${s.status === "pending" ? "opacity-60" : ""}`}>
                <StageIcon status={s.status} />
                <div>
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                    <div className="text-body font-medium text-ink">{i + 1}. {s.label}</div>
                    <div className="text-meta tabular-nums text-ink-3">
                      {s.status === "skipped" ? "nothing to do" : s.status === "pending" ? "waiting" : `${s.done} / ${s.total}`}
                      {dur != null && s.status !== "skipped" && <span className="ml-2">{fmtDuration(dur)}</span>}
                    </div>
                  </div>
                  <div className="mt-1.5"><Bar stage={s} /></div>
                  <p className="mt-1 text-meta text-ink-3">{s.detail ?? s.hint}</p>
                </div>
              </li>
            );
          })}
        </ol>
      ) : (
        <Callout tone="caution">Step-by-step progress isn’t available for this scan. Apply the <code>pipeline_progress</code> migration to enable it.</Callout>
      )}

      {!running && errors.length > 0 && (
        <Callout tone="caution" title="Issues during this scan">
          <ul className="space-y-1">{errors.slice(0, 5).map((e, i) => <li key={i}><b className="font-medium">{e.scope}</b>: {e.message}</li>)}</ul>
        </Callout>
      )}
    </div>
  );
}
