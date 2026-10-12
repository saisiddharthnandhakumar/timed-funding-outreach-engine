"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { overallPercent, STAGES, type StageKey, type StageProgress, type StageStatus } from "@/lib/pipeline/progress";
import type { RunView } from "../use-pipeline-run";

const mmss = (ms: number) => {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

const BLUE = "#0052FF";
const FLOW_LABEL = "Scan pipeline, step by step: funding news, age and keyword check, Gemini review, filters and de-duplication, research, fit score, contact search, outreach draft";
/** Steps where Gemini does the work; the rest is plain code. */
const USES_GEMINI = new Set<StageKey>(["classify", "research", "scoring", "drafts"]);

const WHAT: Record<StageKey, { title: string; idle: string }> = {
  sources: { title: "Funding news", idle: "reads every feed" },
  prefilter: { title: "Age & keywords", idle: "no AI cost" },
  classify: { title: "Gemini review", idle: "funding or not?" },
  filters: { title: "Filters & dedupe", idle: "your filters" },
  research: { title: "Research", idle: "site & web" },
  scoring: { title: "Fit score", idle: "vs your thesis" },
  contacts: { title: "Contact search", idle: "founder emails" },
  drafts: { title: "Outreach draft", idle: "for you to review" },
};

const STATUS_COLOR: Record<StageStatus, string> = { done: "#22c55e", running: BLUE, pending: "#52525b", skipped: "#3f6f55", failed: "#ef4444" };
const STATUS_WORD: Record<StageStatus, string> = { pending: "waiting", running: "in progress", done: "done", skipped: "nothing to do", failed: "failed" };

interface Geometry { w: number; h: number; cols: number; gapX: number; gapY: number; width: number; height: number; font: number }
/** Wide screens: one row of eight. Narrow screens: a two-column snake so the text stays readable. */
const WIDE: Geometry = { w: 106, h: 64, cols: 8, gapX: 38, gapY: 0, width: 1128, height: 140, font: 12 };
const NARROW: Geometry = { w: 150, h: 60, cols: 2, gapX: 40, gapY: 46, width: 352, height: 440, font: 13 };

interface Placed { key: StageKey; x: number; y: number }
/** Row-major placement; on a snake layout every other row runs right-to-left so each step sits next to the one before it. */
function place(g: Geometry): Placed[] {
  return STAGES.map((s, i) => {
    const row = Math.floor(i / g.cols);
    const col = i % g.cols;
    const c = g.cols > 2 || row % 2 === 0 ? col : g.cols - 1 - col;
    return { key: s.key, x: 4 + c * (g.w + g.gapX), y: 30 + row * (g.h + g.gapY) };
  });
}

function connector(a: Placed, b: Placed, g: Geometry): string {
  if (a.y === b.y) {
    const right = b.x > a.x;
    return right ? `M${a.x + g.w + 4},${a.y + g.h / 2} L${b.x - 4},${b.y + g.h / 2}` : `M${a.x - 4},${a.y + g.h / 2} L${b.x + g.w + 4},${b.y + g.h / 2}`;
  }
  return `M${a.x + g.w / 2},${a.y + g.h + 20} L${b.x + g.w / 2},${b.y - 4}`;
}

function AnimatedDot({ path, duration, delay, size, opacity }: { path: string; duration: number; delay: number; size: number; opacity: number }) {
  return (
    <circle r={size} fill={BLUE} opacity={opacity}>
      <animateMotion dur={`${duration}s`} repeatCount="indefinite" begin={`${delay}s`} path={path} />
    </circle>
  );
}

function PulsingDot({ cx, cy, delay, animate }: { cx: number; cy: number; delay: number; animate: boolean }) {
  if (!animate) return <circle cx={cx} cy={cy} r={2.6} fill={BLUE} opacity={0.6} />;
  return <motion.circle cx={cx} cy={cy} r={2.6} fill={BLUE} animate={{ opacity: [0.15, 1, 0.15] }} transition={{ duration: 1.2, delay, repeat: Infinity, ease: "easeInOut" }} />;
}

function Flow({ g, status, stageOf, current, animate, label }: { g: Geometry; status: (k: StageKey) => StageStatus; stageOf: (k: StageKey) => StageProgress | undefined; current: Set<StageKey>; animate: boolean; label: string }) {
  const nodes = place(g);
  return (
    <svg width="100%" viewBox={`0 0 ${g.width} ${g.height}`} className="block" role="img" aria-label={label}>
      <defs>
        <marker id={`scan-arrow-${g.cols}`} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto">
          <path d="M2 1.5L7.5 5L2 8.5" fill="none" stroke="rgba(0,82,255,0.45)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </marker>
      </defs>

      {nodes.slice(1).map((n, i) => {
        const from = nodes[i];
        const d = connector(from, n, g);
        const live = current.has(n.key) || status(from.key) === "running";
        const done = status(from.key) === "done" || status(from.key) === "skipped";
        return (
          <g key={`c-${n.key}`}>
            <path d={d} fill="none" stroke={live ? "rgba(0,82,255,0.4)" : done ? "rgba(34,197,94,0.28)" : "rgba(0,82,255,0.14)"} strokeWidth="1.5" strokeDasharray="3 5" markerEnd={`url(#scan-arrow-${g.cols})`} />
            {animate && live && (
              <>
                <AnimatedDot path={d} duration={1.1} delay={0} size={2.4} opacity={1} />
                <AnimatedDot path={d} duration={1.1} delay={0.37} size={1.8} opacity={0.65} />
                <AnimatedDot path={d} duration={1.1} delay={0.74} size={1.3} opacity={0.35} />
              </>
            )}
          </g>
        );
      })}

      {nodes.map((n, i) => {
        const st = status(n.key);
        const active = current.has(n.key);
        const stage = stageOf(n.key);
        const gem = USES_GEMINI.has(n.key);
        const cx = n.x + g.w / 2;
        const caption = stage && stage.total > 0 ? `${stage.done}/${stage.total}` : st === "skipped" ? "nothing to do" : WHAT[n.key].idle;
        const fill = active || gem ? "#050D1C" : st === "done" ? "#0d130f" : "#141414";
        const stroke = active ? BLUE : st === "failed" ? "#ef4444" : st === "done" ? "rgba(34,197,94,0.35)" : gem ? "rgba(0,82,255,0.35)" : "rgba(255,255,255,0.09)";
        return (
          <g key={n.key} opacity={st === "pending" && !active ? 0.78 : 1}>
            <title>{`Step ${i + 1}: ${STAGES[i].label}, ${STATUS_WORD[st]}`}</title>
            <rect x={n.x} y={n.y} width={g.w} height={g.h} rx="10" fill={fill} stroke={stroke} strokeWidth={active ? 1.3 : 0.8} />
            {active && <rect x={n.x + 14} y={n.y + 0.5} width={g.w - 28} height="1.2" rx="0.6" fill="rgba(51,117,255,0.7)" />}
            <text x={cx} y={n.y + 19} textAnchor="middle" fontSize="9.5" letterSpacing=".07em" fill={active || gem ? "rgba(51,117,255,0.75)" : "rgba(255,255,255,0.3)"}>
              {String(i + 1).padStart(2, "0")}{gem ? " · GEMINI" : ""}
            </text>
            <text x={cx} y={n.y + 40} textAnchor="middle" fontSize={g.font} fill={active ? "#fff" : "rgba(255,255,255,0.82)"} fontWeight={active ? 500 : 400}>{WHAT[n.key].title}</text>
            {active ? (
              <>
                <PulsingDot cx={cx - 10} cy={n.y + g.h - 9} delay={0} animate={animate} />
                <PulsingDot cx={cx} cy={n.y + g.h - 9} delay={0.4} animate={animate} />
                <PulsingDot cx={cx + 10} cy={n.y + g.h - 9} delay={0.8} animate={animate} />
              </>
            ) : (
              <circle cx={n.x + g.w - 12} cy={n.y + 12} r={3} fill={STATUS_COLOR[st]} opacity={st === "pending" ? 0.7 : 0.95} />
            )}
            <text x={cx} y={n.y + g.h + 16} textAnchor="middle" fontSize="9.5" fontFamily="monospace" fill={active ? "rgba(0,82,255,0.75)" : "rgba(255,255,255,0.3)"}>{caption}</text>
          </g>
        );
      })}
    </svg>
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

      <div className="px-3 py-2 sm:px-5">
        <div className="hidden sm:block"><Flow g={WIDE} status={statusOf} stageOf={by} current={current} animate={animate} label={FLOW_LABEL} /></div>
        <div className="sm:hidden"><Flow g={NARROW} status={statusOf} stageOf={by} current={current} animate={animate} label={FLOW_LABEL} /></div>
      </div>

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
