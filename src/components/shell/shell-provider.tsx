"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { HealthSnapshot } from "@/lib/queries";
import { HealthSheet } from "./health-sheet";
import { SearchCommand } from "./search-command";

interface ShellContext {
  snapshot: HealthSnapshot | null;
  openHealth: () => void;
  openSearch: () => void;
}

const Ctx = createContext<ShellContext>({ snapshot: null, openHealth: () => {}, openSearch: () => {} });
export const useShell = () => useContext(Ctx);

/**
 * Owns the two app-wide dialogs (health sheet, ⌘K) and the polled health snapshot, so any component
 * can open them without prop drilling and focus returns to whichever control opened them.
 */
export function ShellProvider({ children }: { children: ReactNode }) {
  const [snapshot, setSnapshot] = useState<HealthSnapshot | null>(null);
  const [healthOpen, setHealthOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const healthTrigger = useRef<HTMLElement | null>(null);
  const searchTrigger = useRef<HTMLElement | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/system/health", { cache: "no-store" });
      if (res.ok) setSnapshot(((await res.json()) as { snapshot: HealthSnapshot | null }).snapshot);
    } catch {
      /* keep the last snapshot */
    }
  }, []);

  useEffect(() => {
    const first = setTimeout(load, 0);
    const id = setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, 60_000);
    const onRun = () => setTimeout(load, 3_000);
    window.addEventListener("pipeline-run-started", onRun);
    const onFinished = () => void load();
    window.addEventListener("pipeline-run-finished", onFinished);
    return () => {
      window.removeEventListener("pipeline-run-finished", onFinished);
      clearTimeout(first);
      clearInterval(id);
      window.removeEventListener("pipeline-run-started", onRun);
    };
  }, [load]);

  const openHealth = useCallback(() => {
    healthTrigger.current = document.activeElement as HTMLElement | null;
    void load();
    setHealthOpen(true);
  }, [load]);
  const openSearch = useCallback(() => {
    searchTrigger.current = document.activeElement as HTMLElement | null;
    setSearchOpen(true);
  }, []);

  // ⌘K / Ctrl+K opens search from anywhere except while typing in a field.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        const t = e.target as HTMLElement | null;
        const typing = t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable) && !t.hasAttribute("data-search-input");
        if (typing) return;
        e.preventDefault();
        openSearch();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [openSearch]);

  const value = useMemo(() => ({ snapshot, openHealth, openSearch }), [snapshot, openHealth, openSearch]);

  return (
    <Ctx.Provider value={value}>
      {children}
      <HealthSheet open={healthOpen} onClose={() => { setHealthOpen(false); healthTrigger.current?.focus?.(); }} snapshot={snapshot} />
      <SearchCommand open={searchOpen} onClose={(navigated) => { setSearchOpen(false); if (!navigated) searchTrigger.current?.focus?.(); }} />
    </Ctx.Provider>
  );
}
