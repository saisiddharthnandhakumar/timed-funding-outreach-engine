"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { overallPercent, STAGES, type StageKey, type StageProgress, type StageStatus } from "@/lib/pipeline/progress";
import type { RunView } from "../use-pipeline-run";

const mmss = (ms: number) => {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

/** Steps where Gemini does the work; the rest is plain code. */
const USES_GEMINI = new Set<StageKey>(["classify", "research", "scoring", "drafts"]);

const WHAT: Record<StageKey, { title: string; idle: string }> = {
  sources: { title: "Funding news", idle: "Reads every feed" },
  prefilter: { title: "Age & keywords", idle: "No AI cost" },
  classify: { title: "Gemini review", idle: "Is it a funding round?" },
  filters: { title: "Stage, country, repeats", idle: "Your thesis filters" },
  research: { title: "Research", idle: "Website & web profile" },
  scoring: { title: "Fit score", idle: "Against your thesis" },
  contacts: { title: "Contact search", idle: "Founder emails" },
  drafts: { title: "Outreach draft", idle: "Written for you to review" },
};

function Check() {
  return (
    <svg width="12" height="12" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 10.5l4 4 8-9" />
    </svg>
  );
}

function StatusMark({ status, animate }: { status: StageStatus; animate: boolean }) {
  if (status === "done") return <span className="grid h-4 w-4 place-items-center rounded-full bg-green-500/20 text-green-400"><Check /></span>;
  if (status === "failed") return <span className="h-2 w-2 rounded-full bg-red-500" />;
  if (status === "skipped") return <span className="h-2 w-2 rounded-full bg-white/25" />;
  if (status === "running") {
    return animate ? (
      <motion.span className="h-2 w-2 rounded-full bg-[#3b82f6]" animate={{ opacity: [0.3, 1, 0.3], scale: [0.85, 1.15, 0.85] }} transition={{ duration: 1.4, repeat: Infinity, ease: "easeInOut" }} />
    ) : (
      <span className="h-2 w-2 rounded-full bg-[#3b82f6]" />
    );
  }
  return <span className="h-2 w-2 rounded-full bg-white/15" />;
}

const STATUS_WORD: Record<StageStatus, string> = { pending: "waiting", running: "in progress", done: "done", skipped: "nothing to do", failed: "failed" };

function Step({ index, stage, status, active, animate }: { index: number; stage: StageProgress | undefined; status: StageStatus; active: boolean; animate: boolean }) {
  const key = STAGES[index].key;
  const meta = WHAT[key];
  const count = stage && stage.total > 0 ? `${stage.done}/${stage.total}` : null;
  const border = active ? "border-[#3b82f6]/80 bg-[#0a1428] shadow-[0_0_0_1px_rgba(59,130,246,0.35),0_0_22px_rgba(59,130,246,0.18)]" : status === "done" ? "border-green-500/25 bg-[#0d130f]" : status === "failed" ? "border-red-500/40 bg-[#160d0d]" : "border-white/[0.07] bg-[#111]";
  return (
    <li aria-current={active ? "step" : undefined} className={`relative flex min-h-[88px] flex-col rounded-[10px] border px-3 py-2.5 transition-colors duration-300 ${border} ${status === "pending" ? "opacity-70" : ""}`}>
      <span className="sr-only">Step {index + 1}: {STAGES[index].label}, {STATUS_WORD[status]}</span>
      <div className="flex items-center justify-between" aria-hidden="true">
        <span className={`font-mono text-[10px] tracking-[0.1em] ${active ? "text-[#6ea1ff]" : "text-white/30"}`}>{String(index + 1).padStart(2, "0")}{USES_GEMINI.has(key) ? " · GEMINI" : ""}</span>
        <StatusMark status={status} animate={animate} />
      </div>
      <div className={`mt-1.5 text-[13px] leading-tight ${active ? "font-medium text-white" : "text-white/80"}`} aria-hidden="true">{meta.title}</div>
      <div className={`mt-auto pt-1.5 font-mono text-[10px] ${active ? "text-[#6ea1ff]" : "text-white/30"}`} aria-hidden="true">
        {count ?? (status === "skipped" ? "nothing to do" : meta.idle)}
      </div>
      {active && animate && <motion.span aria-hidden="true" className="pointer-events-none absolute inset-x-3 top-0 h-px bg-[#3b82f6]" animate={{ opacity: [0.3, 1, 0.3] }} transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }} />}
    </li>
  );
}

/** Live view of a running scan: every pipeline step as a box, with the ones working right now highlighted. */
export default function EnterpriseAIPipeline({ run, starting = false }: { run: RunView | null; starting?: boolean }) {
  const reduceMotion = useReducedMotion();
  const animate = !reduceMotion;
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const progress = run?.status === "running" ? run.progress_json ?? null : null;
  const by = (k: StageKey) => progress?.stages.find((s) => s.key === k);
  const statusOf = (k: StageKey): StageStatus => by(k)?.status ?? "pending";
  const running = STAGES.filter((s) => statusOf(s.key) === "running").map((s) => s.key);
  // Before the first stage reports in, the opening step is the one about to start.
  const current = new Set<StageKey>(running.length ? running : starting || progress ? [STAGES.find((s) => statusOf(s.key) === "pending")?.key ?? "sources"] : []);
  const lead = STAGES.findIndex((s) => current.has(s.key));

  const activity = progress?.activity ?? (starting ? "Starting the scan…" : "Waiting for the scan to begin…");
  const pct = progress ? overallPercent(progress) : 0;
  const elapsed = run?.status === "running" ? now - new Date(run.started_at).getTime() : 0;

  return (
    <div className="mx-auto w-full overflow-hidden rounded-[14px] border border-white/[0.08] bg-[#090909] font-sans text-white">
      <div className="flex items-center justify-between border-b border-white/[0.06] px-[18px] py-[11px]">
        <div className="flex items-center gap-[7px]">
          {animate ? (
            <motion.span className="inline-block h-[6px] w-[6px] rounded-full bg-green-500" animate={{ opacity: [1, 0.2, 1] }} transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }} />
          ) : (
            <span className="inline-block h-[6px] w-[6px] rounded-full bg-green-500" />
          )}
          <span className="font-mono text-[10px] tracking-[0.1em] text-white/30">SCAN · LIVE</span>
          {lead >= 0 && <span className="font-mono text-[10px] tracking-[0.1em] text-[#6ea1ff]/80">· STEP {lead + 1} OF {STAGES.length}</span>}
        </div>
        <span className="font-mono text-[10px] text-white/[0.28]">{run?.status === "running" ? `${mmss(elapsed)} elapsed` : "starting"}</span>
      </div>

      <ol aria-label="Scan pipeline" className="grid grid-cols-2 gap-2.5 p-3.5 sm:grid-cols-4">
        {STAGES.map((s, i) => (
          <Step key={s.key} index={i} stage={by(s.key)} status={statusOf(s.key)} active={current.has(s.key)} animate={animate} />
        ))}
      </ol>

      <div className="h-[52px] border-t border-white/[0.06] px-[18px] py-[9px]">
        <div className="flex h-full items-start gap-2">
          <span className="shrink-0 font-mono text-[13px] leading-[1.5] text-[#0052FF]/55" aria-hidden="true">›</span>
          <div role="status" aria-live="polite" className="relative h-full flex-1 overflow-hidden">
            <AnimatePresence mode="wait">
              <motion.div
                key={activity}
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -5 }}
                transition={{ duration: 0.25 }}
                className="absolute inset-0 font-mono text-[11px] leading-[1.55] text-white/[0.5]"
              >
                {activity}
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-[22px] border-t border-white/[0.06] px-[18px] py-[10px]">
        <Stat label="SCREENED" value={by("prefilter")?.total ?? 0} />
        <Stat label="REVIEWED" value={by("classify")?.done ?? 0} />
        <Stat label="DRAFTED" value={by("drafts")?.done ?? 0} />
        <div className="ml-auto text-right">
          <div className="mb-[3px] text-[9px] tracking-[0.09em] text-white/20">PROGRESS</div>
          <div className="font-mono text-[16px] text-[#5c93ff]">{pct}%</div>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="mb-[3px] text-[9px] tracking-[0.09em] text-white/20">{label}</div>
      <motion.div key={value} initial={{ scale: 1.05 }} animate={{ scale: 1 }} className="font-mono text-[16px] text-white/[0.72]">{value.toLocaleString()}</motion.div>
    </div>
  );
}
