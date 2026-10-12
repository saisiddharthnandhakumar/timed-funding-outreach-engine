"use client";

import Link from "next/link";
import type { HealthSnapshot } from "@/lib/queries";
import { ago, formatDateTime } from "@/lib/format";
import { SOURCE_LEVEL_LABEL } from "@/lib/pipeline/source-health";
import { RunPipelineButton } from "../run-pipeline-button";
import { ScanStatus } from "../scan-status";
import { StatusChip, type Tone } from "../ui";
import { Dialog } from "./dialog";

const LEVEL_TONE: Record<HealthSnapshot["level"], Tone> = { healthy: "ok", delayed: "warn", warning: "bad" };
const SOURCE_TONE: Record<string, Tone> = { healthy: "ok", delayed: "warn", issue: "bad", paused: "neutral", idle: "neutral" };

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[9rem_1fr] gap-3 py-2.5 text-sm">
      <dt className="text-faint">{label}</dt>
      <dd className="text-ink">{children}</dd>
    </div>
  );
}

/** What the one-line health indicator opens: the details a scout needs only when something looks off. */
export function HealthSheet({ open, onClose, snapshot }: { open: boolean; onClose: () => void; snapshot: HealthSnapshot | null }) {
  return (
    <Dialog open={open} onClose={onClose} label="System health" className="max-w-lg">
      <div className="flex items-start justify-between gap-4 border-b border-line px-6 py-4">
        <div>
          <h2 className="text-lg font-semibold">System health</h2>
          {snapshot ? <div className="mt-1"><StatusChip tone={LEVEL_TONE[snapshot.level]}>{snapshot.text}</StatusChip></div> : <p className="mt-1 text-sm text-muted">Checking…</p>}
        </div>
        <form method="dialog">
          <button className="-mr-2 rounded-md p-2 text-muted hover:bg-sunken hover:text-ink" aria-label="Close">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
          </button>
        </form>
      </div>

      {snapshot && (
        <div className="max-h-[70vh] overflow-y-auto px-6 py-4">
          {snapshot.level !== "healthy" && <p className="mb-3 rounded-lg bg-sunken p-3 text-sm text-muted">{snapshot.reason}</p>}
          <ScanStatus />
          <dl className="divide-y divide-line">
            <Row label="Last successful scan">{snapshot.lastSuccessAt ? <>{ago(snapshot.lastSuccessAt)} <span className="text-faint">({formatDateTime(snapshot.lastSuccessAt)})</span></> : "Never"}</Row>
            <Row label="Next expected scan">{snapshot.nextExpectedAt ? <>around {formatDateTime(snapshot.nextExpectedAt)}</> : "Not scheduled yet"}</Row>
            <Row label="Latest error">
              {snapshot.latestFailure ? (
                <>
                  <span className="text-bad">{snapshot.latestFailure.message}</span>
                  <span className="block text-xs text-faint">{ago(snapshot.latestFailure.at)} · {snapshot.latestFailure.trigger} run</span>
                </>
              ) : (
                "None"
              )}
            </Row>
            <Row label="Sources">
              <ul className="space-y-1">
                {snapshot.sources.map((s) => (
                  <li key={s.key} className="flex flex-wrap items-center justify-between gap-2">
                    <span>{s.name}</span>
                    <StatusChip tone={SOURCE_TONE[s.level]}>{SOURCE_LEVEL_LABEL[s.level]}</StatusChip>
                  </li>
                ))}
              </ul>
            </Row>
            <Row label="Vercel cron">
              {snapshot.schedule.vercel}
              <span className="block text-xs text-faint">{snapshot.lastScheduledRunAt ? `Last scheduled run ${ago(snapshot.lastScheduledRunAt)} (${snapshot.lastScheduledRunStatus})` : "No scheduled run recorded yet"}</span>
            </Row>
            <Row label="GitHub Actions">{snapshot.schedule.github}</Row>
          </dl>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-6 py-4">
        <RunPipelineButton />
        <Link href="/settings/system" onClick={onClose} className="text-sm font-medium text-accent hover:underline">View system activity</Link>
      </div>
    </Dialog>
  );
}
