"use client";

import { useCallback, useEffect, useState } from "react";
import type { ProgressSnapshot } from "@/lib/pipeline/progress";

export interface RunView {
  id: string;
  status: string;
  trigger: string;
  started_at: string;
  completed_at: string | null;
  errors_json?: { scope: string; message: string }[] | null;
  progress_json?: ProgressSnapshot | null;
}

/**
 * Polls /api/pipeline/progress: every 2 s while a run is active (or was just started from this tab),
 * every 15 s otherwise. Shared by the technical progress panel and the friendly scan status.
 */
export function usePipelineRun(initial: RunView | null, enabled = true) {
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
    if (!enabled) return;
    const first = setTimeout(poll, 0);
    const id = setInterval(() => {
      setNow(Date.now());
      if (document.visibilityState === "visible") void poll();
    }, active ? 2000 : 15000);
    return () => {
      clearTimeout(first);
      clearInterval(id);
    };
  }, [active, enabled, poll]);

  return { run, now, active };
}
