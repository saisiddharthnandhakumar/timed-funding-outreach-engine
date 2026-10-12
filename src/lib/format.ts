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
  if (cur === "INR") return n >= 1e7 ? `₹${(n / 1e7).toFixed(n >= 1e9 ? 0 : 1)} Cr` : `₹${(n / 1e5).toFixed(1)} L`;
  const sym = cur === "USD" ? "$" : cur === "EUR" ? "€" : cur === "GBP" ? "£" : "";
  const body = n >= 1e6 ? `${(n / 1e6).toFixed(n >= 1e7 ? 0 : 1)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(0)}K` : String(n);
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
