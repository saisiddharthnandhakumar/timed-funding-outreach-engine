"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { formatDateTime, timeAgo, timeUntil } from "@/lib/format";
import type { Label, Tone } from "@/lib/labels";
import type { SystemSummary } from "@/lib/system";
import { Sheet } from "./dialog";
import { ArrowRight } from "./icons";
import { RunPipelineButton } from "./run-pipeline-button";
import { useShell } from "./shell";
import { Callout, StatusLabel, buttonClass, cx } from "./ui";

const LEVEL_TONE: Record<SystemSummary["level"], Tone> = { healthy: "positive", delayed: "caution", warning: "negative", unknown: "neutral" };
const DOT: Record<Tone, string> = { neutral: "bg-ink-3", positive: "bg-ok", caution: "bg-warn", negative: "bg-bad", accent: "bg-accent" };
const SOURCE_TONE: Record<string, Tone> = { healthy: "positive", delayed: "caution", attention: "negative", paused: "neutral", waiting: "neutral" };

/** Opens the system sheet from anywhere (“View issue”). */
export const OPEN_SYSTEM_EVENT = "open-system-sheet";

/**
 * The only always-visible trace of the pipeline: “System healthy · Last scan 34 min ago”.
 * Clicking it opens the details (sources, schedule, latest error). Technical depth lives in Settings → System.
 */
export function SystemStatus() {
  const { summary } = useShell();
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const [path, setPath] = useState(pathname);
  if (path !== pathname) {
    setPath(pathname);
    setOpen(false);
  }
  useEffect(() => {
    const show = () => setOpen(true);
    window.addEventListener(OPEN_SYSTEM_EVENT, show);
    return () => window.removeEventListener(OPEN_SYSTEM_EVENT, show);
  }, []);

  const tone = LEVEL_TONE[summary.level];
  const [short] = summary.chip.split(" · ");
  const label = summary.running ? "Scanning…" : summary.chip;
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        className={cx("inline-flex h-9 max-w-full items-center gap-2 rounded-md px-2.5 text-meta hover:bg-sunken", summary.level === "warning" ? "text-bad" : "text-ink-2")}
      >
        <span className={cx("size-1.5 shrink-0 rounded-full", DOT[tone], summary.running && "animate-pulse")} aria-hidden="true" />
        <span className="truncate md:hidden">{summary.running ? "Scanning…" : short}</span>
        <span className="hidden truncate md:inline">{label}</span>
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} title="System" description="Everything is checked automatically. You only need this page if something looks wrong.">
        <SystemDetails summary={summary} onNavigate={() => setOpen(false)} />
      </Sheet>
    </>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-6 py-2.5">
      <dt className="shrink-0 text-meta text-ink-3">{label}</dt>
      <dd className="text-right text-meta text-ink">{children}</dd>
    </div>
  );
}

export function SystemDetails({ summary: s, onNavigate }: { summary: SystemSummary; onNavigate?: () => void }) {
  const headline: Label = { text: s.running ? "A scan is running" : s.level === "healthy" ? "Healthy" : s.level === "delayed" ? "Running late" : s.level === "warning" ? "Needs attention" : "Unavailable", tone: s.running ? "accent" : LEVEL_TONE[s.level] };
  const problems = s.sources.filter((x) => x.attention);
  return (
    <div className="space-y-6">
      <div>
        <p className="text-heading"><StatusLabel label={headline} /></p>
        <p className="mt-1 text-meta text-ink-2">{s.reason}</p>
      </div>

      {s.latestFailure && s.level === "warning" && (
        <Callout tone="negative" title="Latest problem">
          {s.latestFailure.message}
          <span className="mt-1 block text-ink-3">{timeAgo(s.latestFailure.startedAt)} · {s.latestFailure.trigger === "cron" ? "scheduled" : s.latestFailure.trigger} scan</span>
        </Callout>
      )}

      <dl className="divide-y divide-line border-y border-line">
        <Row label="Last successful scan">{s.lastSuccessAt ? <>{formatDateTime(s.lastSuccessAt)} <span className="text-ink-3">· {timeAgo(s.lastSuccessAt)}</span></> : "Never"}</Row>
        <Row label="Next scheduled scan">{s.nextExpectedAt ? <>{formatDateTime(s.nextExpectedAt)} <span className="text-ink-3">· {timeUntil(s.nextExpectedAt)}</span></> : "—"}</Row>
        <Row label="Schedule">GitHub Actions: {s.schedules.github.toLowerCase()}<br />Vercel cron: {s.schedules.vercel.toLowerCase()}</Row>
        <Row label="Last scheduled run">{s.lastScheduledAt ? timeAgo(s.lastScheduledAt) : "None recorded"}</Row>
      </dl>

      <div>
        <h3 className="mb-1 text-body font-medium">News sources</h3>
        {s.sources.length === 0 ? (
          <p className="text-meta text-ink-3">No sources configured.</p>
        ) : (
          <ul className="divide-y divide-line">
            {s.sources.map((src) => (
              <li key={src.id} className="py-2.5">
                <div className="flex items-center justify-between gap-4">
                  <span className="text-body">{src.name}</span>
                  <StatusLabel label={{ text: src.label, tone: SOURCE_TONE[src.level] ?? "neutral" }} />
                </div>
                {src.attention && <p className="mt-0.5 text-meta text-ink-2">{src.detail}</p>}
              </li>
            ))}
          </ul>
        )}
        {problems.length > 0 && <p className="mt-2 text-meta text-ink-3">Click “Discovery settings” to turn a source off or look closer.</p>}
      </div>

      <div className="flex flex-wrap items-center gap-2 border-t border-line pt-5">
        <RunPipelineButton />
        <Link href="/settings/discovery" onClick={onNavigate} className={buttonClass("ghost")}>Discovery settings</Link>
        <Link href="/settings/system" onClick={onNavigate} className={buttonClass("ghost", "md", "ml-auto")}>System details <ArrowRight /></Link>
      </div>
    </div>
  );
}

/** “View issue”: opens the system sheet from a page. */
export function ViewSystemButton({ children = "View issue" }: { children?: ReactNode }) {
  return (
    <button type="button" onClick={() => window.dispatchEvent(new Event(OPEN_SYSTEM_EVENT))} className={buttonClass("secondary", "sm")}>
      {children}
    </button>
  );
}
