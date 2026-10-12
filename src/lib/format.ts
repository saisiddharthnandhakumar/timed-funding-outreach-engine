import { STAGE_LABELS, type FundingStage } from "@/types/domain";

const TZ = "Asia/Kolkata";

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-IN", { timeZone: TZ, day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", hour12: false }) + " IST";
}

/** “just now”, “34m ago”, “2h ago”, “3d ago”. Whole numbers only: the scout never needs “2.4h”. */
export function timeAgo(iso: string | null | undefined, now = new Date()): string {
  if (!iso) return "—";
  const mins = Math.round((now.getTime() - new Date(iso).getTime()) / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 48) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

/** Minutes → “34 min”, “2.5 h”. */
export function formatMinutes(mins: number | null | undefined): string {
  if (mins == null) return "—";
  return mins < 90 ? `${mins} min` : `${(mins / 60).toFixed(1)} h`;
}

export function formatAmount(amount: number | string | null | undefined, currency: string | null | undefined): string {
  if (amount == null || amount === "") return "Undisclosed";
  const n = Number(amount);
  const cur = (currency ?? "").toUpperCase();
  const trim = (x: string) => x.replace(/\.0$/, "");
  if (cur === "INR") return n >= 1e7 ? `₹${trim((n / 1e7).toFixed(n >= 1e9 ? 0 : 1))} Cr` : `₹${trim((n / 1e5).toFixed(1))} L`;
  const sym = cur === "USD" ? "$" : cur === "EUR" ? "€" : cur === "GBP" ? "£" : "";
  const body = n >= 1e6 ? `${trim((n / 1e6).toFixed(n >= 1e7 ? 0 : 1))}M` : n >= 1e3 ? `${(n / 1e3).toFixed(0)}K` : String(n);
  return `${sym}${body}${sym ? "" : ` ${cur}`}`.trim();
}

export function stageLabel(stage: string | null | undefined): string {
  return stage ? (STAGE_LABELS[stage as FundingStage] ?? stage) : "—";
}

export function hoursDelay(publishedIso: string | null, seenIso: string | null): number | null {
  if (!publishedIso || !seenIso) return null;
  return (new Date(seenIso).getTime() - new Date(publishedIso).getTime()) / 3_600_000;
}

export function formatDelay(hours: number | null): string {
  if (hours == null) return "—";
  if (Math.abs(hours) < 1) return `${Math.round(hours * 60)} min`;
  return `${hours.toFixed(1)} h`;
}

/** “Good morning / afternoon / evening” in the scout’s timezone (IST). */
export function greeting(now = new Date()): string {
  const hour = Number(new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "numeric", hour12: false }).format(now)) % 24;
  return hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
}

export function formatToday(now = new Date()): string {
  return now.toLocaleDateString("en-IN", { timeZone: TZ, weekday: "long", day: "numeric", month: "long" });
}

/** "1 opportunity" / "3 opportunities". */
export const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** “in 12 min”, “in 1h 20m”. For the next scheduled scan. */
export function timeUntil(iso: string | null | undefined, now = new Date()): string {
  if (!iso) return "—";
  const mins = Math.max(0, Math.round((new Date(iso).getTime() - now.getTime()) / 60_000));
  if (mins < 1) return "any moment";
  if (mins < 60) return `in ${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `in ${h}h ${m}m` : `in ${h}h`;
}
