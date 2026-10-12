import { STAGE_LABELS, type FundingStage } from "@/types/domain";

const TZ = "Asia/Kolkata";

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-IN", { timeZone: TZ, day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", hour12: false }) + " IST";
}

export function timeAgo(iso: string | null | undefined, now = new Date()): string {
  if (!iso) return "—";
  const mins = Math.round((now.getTime() - new Date(iso).getTime()) / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const h = mins / 60;
  if (h < 48) return `${h.toFixed(h < 10 ? 1 : 0)}h ago`;
  return `${Math.round(h / 24)}d ago`;
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

/** Compact relative time for scanning lists: "38m ago", "4h ago", "3d ago". */
export function ago(iso: string | null | undefined, now = new Date()): string {
  if (!iso) return "—";
  const mins = Math.max(0, Math.round((now.getTime() - new Date(iso).getTime()) / 60_000));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const h = Math.round(mins / 60);
  if (h < 48) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

/** Same scale as `ago` but without the suffix, for sentences like "Last scan 38m ago". */
export function compactDuration(minutes: number): string {
  const m = Math.max(0, Math.round(minutes));
  if (m < 1) return "under 1m";
  if (m < 60) return `${m}m`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h}h`;
  return `${Math.round(h / 24)}d`;
}

/** "Good morning" / "Good afternoon" / "Good evening" in the scout's timezone (IST). */
export function greeting(now = new Date(), name?: string): string {
  const hour = Number(new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "2-digit", hour12: false }).format(now)) % 24;
  const hello = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  return name ? `${hello}, ${name}` : hello;
}

export function median(values: number[]): number | null {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/** "2 opportunities" / "1 opportunity". */
export const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
