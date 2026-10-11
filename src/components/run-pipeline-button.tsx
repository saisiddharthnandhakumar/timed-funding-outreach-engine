"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function RunPipelineButton() {
  const router = useRouter();
  const [state, setState] = useState<"idle" | "starting" | "started" | "error">("idle");

  async function run() {
    setState("starting");
    try {
      const res = await fetch("/api/pipeline/run", { method: "POST" });
      if (!res.ok) throw new Error(String(res.status));
      setState("started");
      // The run continues server-side; refresh a few times so progress shows up.
      for (const ms of [8_000, 25_000, 60_000]) setTimeout(() => router.refresh(), ms);
    } catch {
      setState("error");
    }
  }

  return (
    <div className="flex items-center gap-3">
      {state === "started" && <span className="text-xs text-slate-500">Run started — results appear below as it progresses.</span>}
      {state === "error" && <span className="text-xs text-rose-600">Could not start the run.</span>}
      <button
        onClick={run}
        disabled={state === "starting"}
        className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-60"
      >
        {state === "starting" ? "Starting…" : "Run pipeline now"}
      </button>
    </div>
  );
}
