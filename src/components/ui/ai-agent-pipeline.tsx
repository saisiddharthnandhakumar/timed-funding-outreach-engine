"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { overallPercent, type StageKey, type StageProgress, type StageStatus } from "@/lib/pipeline/progress";
import type { RunView } from "../use-pipeline-run";

const BLUE = "#0052FF";

function AnimatedDot({ path, duration, delay, size, opacity }: { path: string; duration: number; delay: number; size: number; opacity: number }) {
  return (
    <circle r={size} fill={BLUE} opacity={opacity}>
      <animateMotion dur={`${duration}s`} repeatCount="indefinite" begin={`${delay}s`} path={path} />
    </circle>
  );
}

function PulsingDot({ cx, cy, color, duration, delay = 0, animate }: { cx: number; cy: number; color: string; duration: number; delay?: number; animate: boolean }) {
  if (!animate) return <circle cx={cx} cy={cy} r={2.8} fill={color} opacity={0.6} />;
  return <motion.circle cx={cx} cy={cy} r={2.8} fill={color} animate={{ opacity: [0.15, 1, 0.15] }} transition={{ duration, delay, repeat: Infinity, ease: "easeInOut" }} />;
}

const STATUS_COLOR: Record<StageStatus, string> = { done: "#22c55e", running: "#f59e0b", pending: "#52525b", skipped: "#3f6f55", failed: "#ef4444" };

function StatusIndicator({ cx, cy, status, animate }: { cx: number; cy: number; status: StageStatus; animate: boolean }) {
  if (status === "running" && animate) {
    return <motion.circle cx={cx} cy={cy} r={3} fill={STATUS_COLOR.running} animate={{ opacity: [0.3, 1, 0.3] }} transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }} />;
  }
  return <circle cx={cx} cy={cy} r={3} fill={STATUS_COLOR[status]} opacity={status === "pending" ? 0.7 : 0.95} />;
}

const mmss = (ms: number) => {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

/** Worst-case status for a set of stages: any running → running, all done/skipped → done, etc. */
function combine(stages: (StageProgress | undefined)[]): StageStatus {
  const s = stages.map((x) => x?.status ?? "pending");
  if (s.includes("failed")) return "failed";
  if (s.includes("running")) return "running";
  if (s.every((x) => x === "done" || x === "skipped")) return "done";
  if (s.some((x) => x === "done")) return "running";
  return "pending";
}

const PATHS = {
  p1: "M116,88 L158,88",
  p2: "M268,88 L306,88",
  p3: "M411,88 C425,88 435,50 448,50",
  p4: "M411,88 L448,88",
  p5: "M411,88 C425,88 435,126 448,126",
};

/** What the Gemini node is doing right now, in scout words. */
function agentLabel(by: (k: StageKey) => StageProgress | undefined, allDone: boolean): string {
  if (allDone) return "Finished";
  if (by("scoring")?.status === "running") return "Scoring fit";
  if (by("research")?.status === "running") return "Researching";
  if (by("classify")?.status === "running" || by("filters")?.status === "running") return "Reviewing";
  if (by("contacts")?.status === "running" || by("drafts")?.status === "running") return "Wrapping up";
  return "Waiting";
}

const NODE = { fill: "#141414", stroke: "rgba(255,255,255,0.09)" };

/** Live view of a running scan. Everything on it comes from the run's real per-stage progress. */
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
  const sources = combine([by("sources")]);
  const screening = combine([by("prefilter")]);
  const agentStages = combine([by("classify"), by("filters"), by("research"), by("scoring")]);
  const scoring = combine([by("scoring")]);
  const contacts = combine([by("contacts")]);
  const drafts = combine([by("drafts")]);
  const allDone = !!progress && progress.stages.every((s) => s.status === "done" || s.status === "skipped");
  const agent = agentLabel(by, allDone);
  const agentActive = agentStages === "running";

  const activity = progress?.activity ?? (starting ? "Starting the scan…" : "Waiting for the scan to begin…");
  const pct = progress ? overallPercent(progress) : 0;
  const elapsed = run?.status === "running" ? now - new Date(run.started_at).getTime() : 0;
  const classify = by("classify");

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
        </div>
        <span className="font-mono text-[10px] text-white/[0.28]">{run?.status === "running" ? `${mmss(elapsed)} elapsed` : "starting"}</span>
      </div>

      <svg width="100%" viewBox="0 0 580 172" className="block" role="img" aria-label="Scan pipeline: funding sources, screening, Gemini review, then fit score, contact search and outreach draft">
        <defs>
          <marker id="scan-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto">
            <path d="M2 1.5L7.5 5L2 8.5" fill="none" stroke="rgba(0,82,255,0.45)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          </marker>
        </defs>

        <path d={PATHS.p1} fill="none" stroke="rgba(0,82,255,0.22)" strokeWidth="1.5" strokeDasharray="3 5" markerEnd="url(#scan-arrow)" />
        <path d={PATHS.p2} fill="none" stroke="rgba(0,82,255,0.22)" strokeWidth="1.5" strokeDasharray="3 5" markerEnd="url(#scan-arrow)" />
        <path d={PATHS.p3} fill="none" stroke="rgba(0,82,255,0.15)" strokeWidth="1.5" strokeDasharray="3 5" />
        <path d={PATHS.p4} fill="none" stroke="rgba(0,82,255,0.15)" strokeWidth="1.5" strokeDasharray="3 5" />
        <path d={PATHS.p5} fill="none" stroke="rgba(0,82,255,0.15)" strokeWidth="1.5" strokeDasharray="3 5" />

        {animate && (
          <>
            <AnimatedDot path={PATHS.p1} duration={1.05} delay={0} size={2.5} opacity={1} />
            <AnimatedDot path={PATHS.p1} duration={1.05} delay={0.35} size={1.8} opacity={0.65} />
            <AnimatedDot path={PATHS.p1} duration={1.05} delay={0.7} size={1.3} opacity={0.35} />
            <AnimatedDot path={PATHS.p2} duration={0.88} delay={0.18} size={2.5} opacity={1} />
            <AnimatedDot path={PATHS.p2} duration={0.88} delay={0.62} size={1.8} opacity={0.65} />
            <AnimatedDot path={PATHS.p3} duration={1.3} delay={0.08} size={2.2} opacity={0.9} />
            <AnimatedDot path={PATHS.p3} duration={1.3} delay={0.65} size={1.5} opacity={0.55} />
            <AnimatedDot path={PATHS.p4} duration={1.15} delay={0.28} size={2.2} opacity={0.9} />
            <AnimatedDot path={PATHS.p4} duration={1.15} delay={0.85} size={1.5} opacity={0.55} />
            <AnimatedDot path={PATHS.p5} duration={1.4} delay={0.45} size={2.2} opacity={0.9} />
            <AnimatedDot path={PATHS.p5} duration={1.4} delay={1.0} size={1.5} opacity={0.55} />
          </>
        )}

        {/* Sources */}
        <rect x="16" y="66" width="100" height="44" rx="8" fill={NODE.fill} stroke={sources === "running" ? BLUE : NODE.stroke} strokeWidth={sources === "running" ? 1 : 0.5} />
        <text x="66" y="83" textAnchor="middle" fontSize="9.5" fill="rgba(255,255,255,0.28)" letterSpacing=".07em">SOURCES</text>
        <text x="66" y="100" textAnchor="middle" fontSize="12" fill="rgba(255,255,255,0.82)">Funding news</text>
        <text x="66" y="122" textAnchor="middle" fontSize="8.5" fill="rgba(255,255,255,0.28)" fontFamily="monospace">
          {by("sources") && by("sources")!.total > 0 ? `${by("sources")!.done}/${by("sources")!.total} feeds` : "feeds"}
        </text>

        {/* Screening */}
        <rect x="158" y="66" width="110" height="44" rx="8" fill={NODE.fill} stroke={screening === "running" ? BLUE : NODE.stroke} strokeWidth={screening === "running" ? 1 : 0.5} />
        <text x="213" y="83" textAnchor="middle" fontSize="9.5" fill="rgba(255,255,255,0.28)" letterSpacing=".07em">SCREENING</text>
        <text x="213" y="100" textAnchor="middle" fontSize="12" fill="rgba(255,255,255,0.82)">Age &amp; keywords</text>
        <text x="213" y="122" textAnchor="middle" fontSize="8.5" fill="rgba(255,255,255,0.28)" fontFamily="monospace">
          {by("prefilter") && by("prefilter")!.total > 0 ? `${by("prefilter")!.total} checked` : "no AI cost"}
        </text>

        {/* Gemini */}
        <rect x="306" y="53" width="105" height="70" rx="10" fill="#050D1C" stroke={BLUE} strokeWidth="1" opacity={agentActive || allDone ? 1 : 0.7} />
        <rect x="318" y="53.5" width="80" height="1" rx="0.5" fill="rgba(51,117,255,0.5)" />
        <text x="358" y="78" textAnchor="middle" fontSize="9.5" fill="rgba(51,117,255,0.65)" letterSpacing=".07em">GEMINI</text>
        <text x="358" y="97" textAnchor="middle" fontSize="13" fill="#fff" fontWeight="500">{agent}</text>
        <PulsingDot cx={346} cy={113} color={BLUE} duration={1.2} delay={0} animate={animate && agentActive} />
        <PulsingDot cx={358} cy={113} color={BLUE} duration={1.2} delay={0.4} animate={animate && agentActive} />
        <PulsingDot cx={370} cy={113} color={BLUE} duration={1.2} delay={0.8} animate={animate && agentActive} />
        <text x="358" y="139" textAnchor="middle" fontSize="8.5" fill="rgba(0,82,255,0.55)" fontFamily="monospace">
          {classify && classify.total > 0 ? `${classify.done}/${classify.total} reviewed` : "reviews the news"}
        </text>

        {/* Outputs */}
        {([
          { y: 35, label: "Fit score", status: scoring },
          { y: 73, label: "Contact search", status: contacts },
          { y: 111, label: "Outreach draft", status: drafts },
        ] as const).map((o) => (
          <g key={o.label}>
            <rect x="448" y={o.y} width="116" height="30" rx="7" fill="#111" stroke="rgba(255,255,255,0.07)" strokeWidth="0.5" />
            <text x="490" y={o.y + 18.5} textAnchor="middle" fontSize="11" fill="rgba(255,255,255,0.62)">{o.label}</text>
            <StatusIndicator cx={550} cy={o.y + 8} status={o.status} animate={animate} />
          </g>
        ))}
      </svg>

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
        <Stat label="REVIEWED" value={classify?.done ?? 0} />
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
