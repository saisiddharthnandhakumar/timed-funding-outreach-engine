"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { SystemSummary } from "@/lib/system";

interface ShellValue {
  summary: SystemSummary;
  refresh: () => Promise<void>;
}
const Ctx = createContext<ShellValue | null>(null);

export function useShell(): ShellValue {
  const v = useContext(Ctx);
  if (!v) throw new Error("useShell must be used inside <ShellProvider>");
  return v;
}

/**
 * Holds the system summary for the persistent shell (status chip, sidebar badges). Next keeps layouts
 * mounted across navigations, so the server value alone would go stale: this re-reads it every minute,
 * when the tab regains focus, and after a manual scan is started.
 */
export function ShellProvider({ initial, children }: { initial: SystemSummary; children: ReactNode }) {
  const [summary, setSummary] = useState(initial);
  // A fresh server render (e.g. after a server action) hands down a new object: adopt it without an effect.
  const [seen, setSeen] = useState(initial);
  if (seen !== initial) {
    setSeen(initial);
    setSummary(initial);
  }

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/system", { cache: "no-store" });
      if (res.ok) setSummary((await res.json()) as SystemSummary);
    } catch {
      /* keep showing the last known state */
    }
  }, []);

  useEffect(() => {
    const tick = setInterval(() => document.visibilityState === "visible" && void refresh(), 60_000);
    const onVisible = () => document.visibilityState === "visible" && void refresh();
    const onRun = () => [15_000, 60_000, 150_000].forEach((ms) => setTimeout(() => void refresh(), ms));
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("pipeline-run-started", onRun);
    return () => {
      clearInterval(tick);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("pipeline-run-started", onRun);
    };
  }, [refresh]);

  const value = useMemo(() => ({ summary, refresh }), [summary, refresh]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
