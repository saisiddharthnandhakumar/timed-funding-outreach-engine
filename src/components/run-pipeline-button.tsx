"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { buttonClass } from "./ui";

/** Starts a manual scan (same `POST /api/pipeline/run`). The run continues server-side; progress is shown by the scan banner. */
export function RunPipelineButton({ variant = "secondary", label = "Scan now", className = "" }: { variant?: "secondary" | "primary" | "ghost"; label?: string; className?: string }) {
  const router = useRouter();
  const [state, setState] = useState<"idle" | "starting" | "started" | "error">("idle");

  async function run() {
    setState("starting");
    try {
      const res = await fetch("/api/pipeline/run", { method: "POST" });
      if (!res.ok) throw new Error(String(res.status));
      setState("started");
      window.dispatchEvent(new Event("pipeline-run-started"));
      // The run continues server-side; refresh a few times so new results show up.
      for (const ms of [8_000, 25_000, 60_000, 120_000]) setTimeout(() => router.refresh(), ms);
      setTimeout(() => setState("idle"), 90_000);
    } catch {
      setState("error");
    }
  }

  return (
    <span className="inline-flex items-center gap-3">
      {state === "error" && <span role="alert" className="text-meta text-bad">Couldn’t start the scan.</span>}
      <button type="button" onClick={run} disabled={state === "starting" || state === "started"} className={buttonClass(variant, "md", className)}>
        {state === "starting" ? "Starting…" : state === "started" ? "Scan started" : label}
      </button>
    </span>
  );
}
