import { z } from "zod";
import { sha256 } from "@/lib/util/text";
import { OUTREACH_SAFE, type VerificationStatus } from "@/lib/contacts/types";

/**
 * Human-triggered sending of ONE approved draft through Resend. Nothing in the pipeline calls this: it is
 * reachable only from the Send button on the Drafts page (a person decides every send).
 */
export interface SendConfig {
  apiKey?: string;
  fromEmail?: string;
  fromName?: string;
  replyTo?: string;
}

export interface DraftRow {
  id: string;
  startup_id: string;
  status: string;
  recipient_name: string | null;
  recipient_email: string | null;
  subject: string;
  body: string;
}

export interface SendStore {
  loadDraft(id: string): Promise<DraftRow | null>;
  /** Verification status of this exact address in startup_contacts; null when the operator typed it in. */
  contactStatus(startupId: string, email: string): Promise<VerificationStatus | null>;
  /** Atomically move approved → sent. Returns false if the draft is no longer approved. */
  markSent(id: string, sentAtIso: string): Promise<boolean>;
  log(event: string, message: string, meta: Record<string, unknown>): Promise<void>;
}

export type SendFailure = "not_configured" | "not_found" | "bad_status" | "no_recipient" | "weak_contact" | "provider_error";
export type SendResult = { ok: true; messageId: string; warning?: string } | { ok: false; code: SendFailure; message: string };

const EmailSchema = z.string().trim().email();

export function sendConfigProblem(c: SendConfig): string | null {
  if (!c.apiKey) return "RESEND_API_KEY is not set.";
  if (!c.fromEmail || !EmailSchema.safeParse(c.fromEmail).success) return "RESEND_FROM_EMAIL is not set to a valid address.";
  return null;
}

export const formatFrom = (c: SendConfig) => (c.fromName ? `${c.fromName.replace(/[<>"]/g, "")} <${c.fromEmail}>` : (c.fromEmail ?? ""));

export async function sendApprovedDraft(
  deps: { store: SendStore; config: SendConfig; fetchImpl?: typeof fetch; now?: () => Date },
  draftId: string,
): Promise<SendResult> {
  const { store, config } = deps;
  const problem = sendConfigProblem(config);
  if (problem) return { ok: false, code: "not_configured", message: problem };

  const draft = await store.loadDraft(draftId);
  if (!draft) return { ok: false, code: "not_found", message: "Draft not found." };
  if (draft.status !== "approved") {
    return { ok: false, code: "bad_status", message: draft.status === "sent" ? "This draft has already been sent." : "Approve the draft before sending it." };
  }
  const to = EmailSchema.safeParse(draft.recipient_email ?? "");
  if (!to.success) return { ok: false, code: "no_recipient", message: "Add a valid recipient email and save before sending." };
  const toEmail = to.data.toLowerCase();

  // A known contact must be published or provider-verified; an address the operator typed in is their own decision.
  const known = await store.contactStatus(draft.startup_id, toEmail);
  if (known && !OUTREACH_SAFE.has(known)) {
    return { ok: false, code: "weak_contact", message: `${toEmail} is only a ${known.replace(/_/g, " ")} address, not a confirmed one. Use a published/verified address, or replace it with an address you have confirmed yourself.` };
  }

  const payload = {
    from: formatFrom(config),
    to: [toEmail],
    subject: draft.subject,
    text: draft.body,
    ...(config.replyTo ? { reply_to: config.replyTo } : {}),
  };
  // Same draft + same content ⇒ same key ⇒ Resend never delivers it twice (double-clicks, retries after a timeout).
  const idempotencyKey = `outreach-${draft.id}-${sha256(toEmail, draft.subject, draft.body).slice(0, 16)}`;

  let messageId: string;
  try {
    const res = await (deps.fetchImpl ?? fetch)("https://api.resend.com/emails", {
      method: "POST",
      headers: { authorization: `Bearer ${config.apiKey}`, "content-type": "application/json", "idempotency-key": idempotencyKey },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(20_000),
    });
    const json = (await res.json().catch(() => ({}))) as { id?: string; message?: string; name?: string };
    if (!res.ok || !json.id) {
      const message = `Resend rejected the email (${res.status}${json.name ? ` ${json.name}` : ""}): ${json.message ?? "no details"}`;
      await store.log("email_send_failed", `${draft.id}: ${message}`, { outreach_id: draft.id, status: res.status });
      return { ok: false, code: "provider_error", message };
    }
    messageId = json.id;
  } catch (err) {
    const message = `Could not reach Resend: ${err instanceof Error ? err.message : String(err)}. The draft is still approved; check your inbox/Resend before retrying (a retry will not double-send).`;
    await store.log("email_send_failed", `${draft.id}: ${message}`, { outreach_id: draft.id });
    return { ok: false, code: "provider_error", message };
  }

  const sentAt = (deps.now ?? (() => new Date()))().toISOString();
  await store.log("email_sent", `Email sent to ${toEmail}`, { outreach_id: draft.id, startup_id: draft.startup_id, resend_id: messageId, to: toEmail, from: config.fromEmail });
  const marked = await store.markSent(draft.id, sentAt).catch(() => false);
  return marked ? { ok: true, messageId } : { ok: true, messageId, warning: "Email was sent but the draft could not be marked as sent; mark it manually." };
}
