import { formatAmount, formatDateTime, stageLabel } from "@/lib/format";
import { esc } from "./client";

export interface DraftFacts {
  outreachId: string;
  status: string;
  startupName: string;
  description: string | null;
  stage: string | null;
  amount: number | string | null;
  currency: string | null;
  score: number | null;
  recipientEmail: string | null;
  /** When the funding was announced (earliest report), the start of the outreach window. */
  announcedAt: Date;
}

export const HOUR = 3_600_000;

/** When the outreach window closes for a funding announcement. */
export const windowEnd = (announcedAt: Date, windowHours: number) => new Date(announcedAt.getTime() + windowHours * HOUR);

/** "21h 30m", "45m": hours left in the window, never negative. */
export function formatLeft(ms: number): string {
  const mins = Math.max(0, Math.round(ms / 60_000));
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h === 0 ? `${m}m` : m === 0 ? `${h}h` : `${h}h ${m}m`;
}

const link = (url: string | null, label: string) => (url ? `<a href="${esc(url).replace(/"/g, "&quot;")}">${label}</a>` : label);

const STATUS_WORD: Record<string, string> = { generated: "ready for review", draft_created: "ready for review", approved: "approved, ready to send" };

/** "A startup has been found, and an email has been drafted." */
export function foundMessage(f: DraftFacts, now: Date, windowHours: number, draftUrl: string | null): string {
  const left = windowEnd(f.announcedAt, windowHours).getTime() - now.getTime();
  const funding = [f.stage ? stageLabel(f.stage) : null, f.amount != null ? formatAmount(f.amount, f.currency) : null].filter(Boolean).join(" · ");
  const lines = [
    `🚀 <b>New startup found: ${esc(f.startupName)}</b>`,
    funding && esc(funding),
    f.description && esc(f.description.length > 160 ? `${f.description.slice(0, 157)}…` : f.description),
    f.score != null && `Fit score: <b>${f.score}/100</b>`,
    f.recipientEmail ? `Draft addressed to ${esc(f.recipientEmail)}` : "No founder email yet, so add a recipient before sending",
    left > 0 ? `⏳ ${formatLeft(left)} left to reach out inside the ${windowHours}-hour window` : `⚠️ The ${windowHours}-hour window has already closed`,
    link(draftUrl, "Review the draft →"),
  ];
  return lines.filter(Boolean).join("\n");
}

/** Sent once, `leadHours` before the window closes, for a draft that has not gone out. */
export function deadlineMessage(f: DraftFacts, now: Date, windowHours: number, draftUrl: string | null): string {
  const end = windowEnd(f.announcedAt, windowHours);
  const left = end.getTime() - now.getTime();
  return [
    `⏰ <b>${formatLeft(left)} left to email ${esc(f.startupName)}</b>`,
    `The ${windowHours}-hour window closes at ${esc(formatDateTime(end.toISOString()))}.`,
    `Draft is ${STATUS_WORD[f.status] ?? esc(f.status)}${f.recipientEmail ? ` for ${esc(f.recipientEmail)}` : ", with no recipient email yet"}.`,
    link(draftUrl, "Open the draft →"),
  ].join("\n");
}
