"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/supabase/admin";
import { env } from "@/lib/env";
import { sendApprovedDraft } from "@/lib/outreach/send";
import { SupabaseSendStore } from "@/lib/outreach/send-store";
import { attachLinkedInDm } from "@/lib/outreach/linkedin";
import { getAI } from "@/lib/ai";

const EditSchema = z.object({
  id: z.string().uuid(),
  subject: z.string().trim().min(3).max(200),
  body: z.string().trim().min(20).max(5000),
  recipient_name: z.string().trim().max(120).optional().transform((v) => v || null),
  recipient_email: z.string().trim().email().optional().or(z.literal("")).transform((v) => v || null),
});

const EDITABLE = ["generated", "draft_created", "approved"];

/** Everything that shows draft state: the queue, the review view, Today and the opportunity list. */
function revalidateDraftViews(id?: string) {
  revalidatePath("/drafts");
  if (id) revalidatePath(`/drafts/${id}`);
  revalidatePath("/today");
  revalidatePath("/opportunities");
}

export async function updateDraft(formData: FormData) {
  const parsed = EditSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return;
  const { id, ...rest } = parsed.data;
  await db().from("outreach").update(rest).eq("id", id).in("status", EDITABLE);
  revalidateDraftViews(id);
}

const TRANSITIONS: Record<string, string[]> = {
  approved: ["generated", "draft_created"],
  rejected: ["generated", "draft_created", "approved"],
  cancelled: ["generated", "draft_created", "approved"],
  // The operator sends from their own mail client; this only records that they did.
  sent: ["approved", "draft_created", "generated"],
};

export async function setDraftStatus(formData: FormData) {
  const id = z.string().uuid().safeParse(formData.get("id"));
  const to = String(formData.get("to") ?? "");
  if (!id.success || !(to in TRANSITIONS)) return;
  await db()
    .from("outreach")
    .update({ status: to, ...(to === "sent" ? { sent_at: new Date().toISOString() } : {}) })
    .eq("id", id.data)
    .in("status", TRANSITIONS[to]);
  revalidateDraftViews(id.data);
}

/** The Send button: one approved draft, one human click, sent through Resend. */
export async function sendDraftEmail(draftId: string): Promise<{ ok: boolean; message: string }> {
  const id = z.string().uuid().safeParse(draftId);
  if (!id.success) return { ok: false, message: "Invalid draft id." };
  const e = env();
  const result = await sendApprovedDraft(
    { store: new SupabaseSendStore(), config: { apiKey: e.RESEND_API_KEY, fromEmail: e.RESEND_FROM_EMAIL, fromName: e.RESEND_FROM_NAME ?? e.OUTREACH_SENDER_NAME, replyTo: e.RESEND_REPLY_TO } },
    id.data,
  );
  revalidateDraftViews(id.data);
  if (!result.ok) return { ok: false, message: result.message };
  return { ok: true, message: result.warning ?? "Email sent." };
}

/** "Find LinkedIn contact": look up a founder/team member and write a cold DM for this draft's startup. */
export async function createLinkedInDm(draftId: string): Promise<{ ok: boolean; message: string }> {
  const id = z.string().uuid().safeParse(draftId);
  if (!id.success) return { ok: false, message: "Invalid draft id." };
  const r = await attachLinkedInDm(getAI(), id.data, { force: true });
  revalidateDraftViews(id.data);
  if (r.status === "created") return { ok: true, message: `Drafted a DM for ${r.target.name}.` };
  if (r.status === "not_found") return { ok: false, message: "Couldn’t find a public LinkedIn profile for a founder or team member." };
  if (r.status === "skipped") return { ok: false, message: `Skipped: ${r.reason}.` };
  return { ok: false, message: `LinkedIn lookup failed: ${r.message}` };
}
