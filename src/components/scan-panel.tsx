"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import EnterpriseAIPipeline from "./ui/ai-agent-pipeline";
import { usePipelineRun } from "./use-pipeline-run";
import { btn } from "./ui";

/** A run row still marked "running" after this long belongs to an instance that died; don't show it as live. */
const STALE_RUN_MS = 8 * 60_000;
/** After clicking, how long to wait for the new run to appear before giving up on showing the live view. */
const START_GRACE_MS = 30_000;

/**
 * The Today page's "Scan now": starts a scan, then shows the live pipeline view while it runs and refreshes
 * the page (funnel, opportunities) when it finishes. Also shows the view if a scheduled scan happens to be running.
 */
export function ScanPanel() {
  const router = useRouter();
  const { run, now } = usePipelineRun(null);
  const [clickedAt, setClickedAt] = useState<number | null>(null);
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [finished, setFinished] = useState<string | null>(null);

  const runStarted = run ? new Date(run.started_at).getTime() : 0;
  const running = run?.status === "running" && now - runStarted < STALE_RUN_MS;
  const waitingForRun = clickedAt !== null && now - clickedAt < START_GRACE_MS && !(running && runStarted >= clickedAt - 5_000);
  const live = running || waitingForRun;

  // Running → not running: the scan ended, so pull in the new results.
  const wasLive = useRef(false);
  useEffect(() => {
    if (wasLive.current && !live && run) {
      setFinished(run.status === "failed" ? "The scan hit an error. Details are under Settings → System." : run.status === "partial" ? "Scan finished with a few warnings." : "Scan finished.");
      router.refresh();
      window.dispatchEvent(new Event("pipeline-run-finished")); // the sidebar/health line re-reads its status
    }
    wasLive.current = live;
  }, [live, run, router]);

  async function start() {
    setError(null);
    setFinished(null);
    setPosting(true);
    try {
      const res = await fetch("/api/pipeline/run", { method: "POST" });
      if (!res.ok) throw new Error(String(res.status));
      setClickedAt(Date.now());
      window.dispatchEvent(new Event("pipeline-run-started"));
    } catch {
      setError("Couldn’t start the scan. Try again.");
    } finally {
      setPosting(false);
    }
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <button type="button" onClick={start} disabled={posting || live} className={btn.primary}>
          {posting ? "Starting…" : live ? "Scanning…" : "Scan now"}
        </button>
        <span role="status" className="text-sm text-muted">
          {!live && !error && !finished && "Checks every source for new funding news."}
          {finished && !live && finished}
          {error && <span className="text-bad">{error}</span>}
        </span>
      </div>
      {live && (
        <div className="mt-5 max-w-2xl">
          <EnterpriseAIPipeline run={running ? run : null} starting={waitingForRun} />
        </div>
      )}
    </div>
  );
}
