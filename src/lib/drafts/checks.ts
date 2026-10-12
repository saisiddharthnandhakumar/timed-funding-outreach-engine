/**
 * “Why this message”: facts about a real draft, computed from the draft itself and the data behind it.
 * Nothing here is asserted by a model. Each check says what is true and whether it needs the scout’s eye.
 */
import type { VerificationStatus } from "@/lib/contacts/types";

export interface MessageCheck {
  ok: boolean;
  text: string;
}

export interface CheckInput {
  startupName: string;
  stageLabel: string | null;
  amountLabel: string | null;
  subject: string;
  body: string;
  recipientName: string | null;
  recipientEmail: string | null;
  /** Verification state of this exact address in startup_contacts; null if the operator typed it in. */
  recipientVerification: VerificationStatus | null;
  researchSourceCount: number;
}

const TRUSTED: VerificationStatus[] = ["publicly_confirmed", "provider_verified"];

export function messageChecks(i: CheckInput): MessageCheck[] {
  const text = `${i.subject}\n${i.body}`.toLowerCase();
  const out: MessageCheck[] = [];

  const stage = i.stageLabel && i.stageLabel !== "—" ? i.stageLabel.toLowerCase() : null;
  const mentionsRound = (stage && text.includes(stage)) || (i.amountLabel && i.amountLabel !== "Undisclosed" && text.includes(i.amountLabel.toLowerCase())) || /\b(funding|raise|raised|round)\b/.test(text);
  out.push(mentionsRound ? { ok: true, text: `Mentions their recent${stage ? ` ${stage}` : ""} round` } : { ok: false, text: "Doesn’t mention the funding round. Consider adding it." });

  out.push(text.includes(i.startupName.toLowerCase()) ? { ok: true, text: `Refers to ${i.startupName} by name` } : { ok: false, text: `Doesn’t mention ${i.startupName} by name` });

  const first = i.recipientName?.trim().split(/\s+/)[0];
  if (!first) out.push({ ok: false, text: "No recipient name on file" });
  else out.push(i.body.toLowerCase().includes(first.toLowerCase()) ? { ok: true, text: `Addresses ${first} directly` } : { ok: false, text: `Doesn’t address ${first} by name` });

  if (!i.recipientEmail) out.push({ ok: false, text: "No recipient email yet. Add one before sending." });
  else if (i.recipientVerification && TRUSTED.includes(i.recipientVerification)) out.push({ ok: true, text: i.recipientVerification === "publicly_confirmed" ? "Recipient address is published by the company" : "Recipient address was verified" });
  else out.push({ ok: false, text: i.recipientVerification ? "Recipient address is not verified. Check it before sending." : "Recipient address was entered by hand. Check it before sending." });

  out.push(i.researchSourceCount > 0 ? { ok: true, text: `Built from ${i.researchSourceCount} research ${i.researchSourceCount === 1 ? "source" : "sources"}` } : { ok: false, text: "No research sources on file for this company" });
  return out;
}

/** Gmail compose link prefilled from the saved draft. Falls back to a body-less link if the URL would be unwieldy. */
export function gmailComposeUrl(d: { to: string | null; subject: string; body: string }): string {
  const base = new URLSearchParams({ view: "cm", fs: "1" });
  if (d.to) base.set("to", d.to);
  base.set("su", d.subject);
  const full = new URLSearchParams(base);
  full.set("body", d.body);
  const url = `https://mail.google.com/mail/?${full.toString()}`;
  return url.length <= 8000 ? url : `https://mail.google.com/mail/?${base.toString()}`;
}
