"use client";

import { usePathname } from "next/navigation";
import type { HealthSnapshot } from "@/lib/queries";
import { StatusChip, type Tone } from "../ui";
import { useShell } from "./shell-provider";

const TONE: Record<HealthSnapshot["level"], Tone> = { healthy: "ok", delayed: "warn", warning: "bad" };

/**
 * The one-line health sentence ("System healthy · Last scan 37m ago"). Clicking opens the health sheet.
 * Pass `initial` on pages that render it server-side (Today) so it is correct before the first poll.
 */
export function SystemHealthLine({ initial }: { initial?: Pick<HealthSnapshot, "level" | "text"> }) {
  const { snapshot, openHealth } = useShell();
  const h = snapshot ?? initial;
  if (!h) return <span className="skeleton inline-block h-4 w-56 align-middle" aria-hidden="true" />;
  return (
    <button type="button" onClick={openHealth} aria-haspopup="dialog" className="-mx-1 inline-flex items-center rounded-md px-1 py-0.5 text-left hover:bg-sunken">
      <StatusChip tone={TONE[h.level]}>{h.text}</StatusChip>
      <span className="sr-only"> — open health details</span>
    </button>
  );
}

/** Quiet sidebar indicator. Hidden on Today, which already shows the full sentence (one status per view). */
export function SidebarHealth() {
  const path = usePathname();
  const { snapshot, openHealth } = useShell();
  if (path === "/today" || !snapshot) return null;
  return (
    <button type="button" onClick={openHealth} aria-haspopup="dialog" className="w-full rounded-lg px-3 py-2 text-left text-xs leading-snug hover:bg-sunken">
      <StatusChip tone={TONE[snapshot.level]}>{snapshot.text.split(" · ")[0]}</StatusChip>
      <span className="sr-only">. Open health details.</span>
    </button>
  );
}

/** Only prominent when something is wrong; absent while healthy. */
export function HealthNotice() {
  const path = usePathname();
  const { snapshot, openHealth } = useShell();
  if (!snapshot || snapshot.level === "healthy" || path === "/today") return null;
  return (
    <div role="status" className={`mb-6 rounded-lg px-4 py-2.5 text-sm ${snapshot.level === "warning" ? "bg-bad-soft" : "bg-warn-soft"}`}>
      <button type="button" onClick={openHealth} aria-haspopup="dialog" className="flex w-full flex-wrap items-center justify-between gap-2 text-left">
        <StatusChip tone={TONE[snapshot.level]}>{snapshot.text}</StatusChip>
        <span className="font-medium text-ink underline underline-offset-2">Details</span>
      </button>
    </div>
  );
}
