"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { btn } from "./ui";

/** Starts a scan. The run continues server-side; the scan status (friendly) and System page (technical) show progress. */
export function RunPipelineButton({ variant = "secondary", label = "Scan now" }: { variant?: "primary" | "secondary"; label?: string }) {
  const router = useRouter();
  const [state, setState] = useState<"idle" | "starting" | "started" | "error">("idle");

  async function run() {
    setState("starting");
    try {
      const res = await fetch("/api/pipeline/run", { method: "POST" });
      if (!res.ok) throw new Error(String(res.status));
      setState("started");
      window.dispatchEvent(new Event("pipeline-run-started"));
      // Refresh a few times so new opportunities show up as the scan advances.
      for (const ms of [8_000, 25_000, 60_000]) setTimeout(() => router.refresh(), ms);
    } catch {
      setState("error");
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <button type="button" onClick={run} disabled={state === "starting"} className={btn[variant]}>
        {state === "starting" ? "Starting…" : label}
      </button>
      <span role="status" className="text-sm text-muted">
        {state === "started" && "Scan started. This takes a few minutes."}
        {state === "error" && <span className="text-bad">Couldn’t start the scan. Try again.</span>}
      </span>
    </div>
  );
}
