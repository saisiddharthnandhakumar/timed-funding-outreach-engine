import { ago, formatAmount, stageLabel } from "@/lib/format";
import { isVerifiedContact } from "@/lib/labels";

/**
 * "Why now", "why it fits", the outreach angle and the draft checks are all derived from stored facts
 * (round, amount, investors, announcement time, positive signals, research). Nothing here asks a model
 * anything new, and nothing asserts a fact that is not in the data. Sparse data yields fewer lines,
 * never filler.
 */

export interface WhyNowInput {
  name: string;
  stage: string | null;
  amount: number | string | null;
  currency: string | null;
  announcedAt: string | null;
  investors: { name: string; lead: boolean }[];
  now?: Date;
}

export interface WhyNow {
  /** One sentence for cards. */
  summary: string;
  /** Ordered supporting lines for the detail page. */
  points: string[];
}

const hoursSince = (iso: string | null, now: Date) => (iso ? Math.max(0, (now.getTime() - new Date(iso).getTime()) / 3_600_000) : null);

export function roundPhrase(stage: string | null, amount: number | string | null, currency: string | null): string {
  const hasStage = stage && stage !== "unknown";
  const label = hasStage ? stageLabel(stage) : null;
  const money = amount != null && amount !== "" ? formatAmount(amount, currency) : null;
  if (label && money) return `${label} round of ${money}`;
  if (label) return `${label} round`;
  if (money) return `funding round of ${money}`;
  return "funding round";
}

export function buildWhyNow(i: WhyNowInput): WhyNow {
  const now = i.now ?? new Date();
  const lead = i.investors.find((x) => x.lead)?.name ?? null;
  const others = i.investors.filter((x) => x.name !== lead).map((x) => x.name);
  const phrase = roundPhrase(i.stage, i.amount, i.currency);
  const when = i.announcedAt ? ago(i.announcedAt, now) : null;

  const summary = `${phrase[0].toUpperCase()}${phrase.slice(1)}${when ? ` announced ${when}` : " announced"}${lead ? `, led by ${lead}` : ""}.`;

  const points: string[] = [];
  if (others.length) {
    points.push(`${lead ? "Also backed by" : "Backed by"} ${others.slice(0, 3).join(", ")}${others.length > 3 ? ` and ${others.length - 3} more` : ""}.`);
  }
  const h = hoursSince(i.announcedAt, now);
  if (h != null) {
    points.push(
      h < 24
        ? `Reported ${when}. A congratulatory note now lands while the news is still current.`
        : h < 72
          ? `Reported ${when}. Still recent enough that a note will feel timely.`
          : `Reported ${when}. The window is closing, so reach out soon.`,
    );
  }
  if (i.stage === "pre-seed" || i.stage === "seed") {
    points.push("Early rounds are when founders pick programmes, investors and first hires.");
  }
  return { summary, points };
}

export interface FitInput {
  signals: string[];
  sector: string | null;
  subsector: string | null;
  businessModel: string | null;
}

/** Concise reasons the startup fits. Falls back to the classification when no signals were stored. */
export function buildWhyFit(i: FitInput, limit = 4): string[] {
  const signals = i.signals.map((s) => s.trim()).filter(Boolean);
  if (signals.length) return signals.slice(0, limit);
  return [i.subsector, i.sector, i.businessModel].filter((x): x is string => Boolean(x)).slice(0, limit);
}

const lowerFirst = (s: string) => (s ? s[0].toLowerCase() + s.slice(1) : s);
const stripDot = (s: string) => s.replace(/[.\s]+$/, "");

export interface AngleInput {
  founderFirstName: string | null;
  stage: string | null;
  signals: string[];
  traction: string[];
  customers: string[];
}

export function buildAngle(i: AngleInput): { angle: string | null; talkingPoints: string[] } {
  const top = i.signals[0];
  const roundBit = i.stage && i.stage !== "unknown" ? `the ${stageLabel(i.stage)} round` : "the round";
  const angle = top
    ? `Congratulate ${i.founderFirstName ?? "the founders"} on ${roundBit}, then lead with ${lowerFirst(stripDot(top))}.`
    : null;
  const points = [...i.signals.slice(0, 3), ...i.traction.slice(0, 2), ...i.customers.slice(0, 1)].map((s) => stripDot(s.trim())).filter(Boolean);
  return { angle, talkingPoints: [...new Set(points)].slice(0, 5) };
}

export interface ReadinessCheck {
  label: string;
  ok: boolean;
}

export interface Readiness {
  state: "no-draft" | "needs-review" | "needs-recipient" | "ready";
  summary: string;
  checks: ReadinessCheck[];
}

export function buildReadiness(d: { exists: boolean; status: string | null; recipientName: string | null; recipientEmail: string | null; emailVerification: string | null }): Readiness {
  if (!d.exists) return { state: "no-draft", summary: "No draft yet", checks: [{ label: "Draft written", ok: false }] };
  const approved = d.status === "approved" || d.status === "sent";
  const verified = Boolean(d.recipientEmail) && isVerifiedContact(d.emailVerification);
  const checks: ReadinessCheck[] = [
    { label: "Draft written", ok: true },
    { label: "Recipient named", ok: Boolean(d.recipientName) },
    { label: "Recipient email on file", ok: Boolean(d.recipientEmail) },
    { label: "Email address verified", ok: verified },
    { label: "Approved by you", ok: approved },
  ];
  if (!d.recipientEmail) return { state: "needs-recipient", summary: "Needs a recipient email", checks };
  if (!approved) return { state: "needs-review", summary: "Ready for your review", checks };
  return { state: "ready", summary: "Approved and ready to send", checks };
}

export interface MessageCheckInput {
  startupName: string;
  stage: string | null;
  amountText: string | null;
  recipientName: string | null;
  recipientEmail: string | null;
  emailVerification: string | null;
  body: string;
  signalCount: number;
}

/** Plain, verifiable statements about the draft, so the scout can see what it is built on. */
export function buildMessageChecks(i: MessageCheckInput): ReadinessCheck[] {
  const body = i.body.toLowerCase();
  const out: ReadinessCheck[] = [];
  const first = i.recipientName?.trim().split(/\s+/)[0];
  out.push({ label: first ? `Addressed to ${first}` : "No named recipient yet", ok: Boolean(first) && body.includes(first!.toLowerCase()) });
  out.push({ label: `Mentions ${i.startupName}`, ok: body.includes(i.startupName.toLowerCase()) });
  const stage = i.stage && i.stage !== "unknown" ? stageLabel(i.stage).toLowerCase() : null;
  const mentionsRound = (stage && body.includes(stage)) || (i.amountText && i.amountText !== "Undisclosed" && body.includes(i.amountText.toLowerCase())) || /\bround\b|\braise\b|\bfunding\b/.test(body);
  out.push({ label: "References the recent funding", ok: Boolean(mentionsRound) });
  if (i.signalCount > 0) out.push({ label: `Built on ${i.signalCount} research ${i.signalCount === 1 ? "signal" : "signals"} about the fit`, ok: true });
  out.push({
    label: i.recipientEmail ? (isVerifiedContact(i.emailVerification) ? "Recipient address is verified" : "Recipient address is not verified") : "No recipient email on file",
    ok: Boolean(i.recipientEmail) && isVerifiedContact(i.emailVerification),
  });
  return out;
}
