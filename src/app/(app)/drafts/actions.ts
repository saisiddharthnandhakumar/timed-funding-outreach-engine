"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/supabase/admin";
import { env } from "@/lib/env";
import { sendApprovedDraft } from "@/lib/outreach/send";
import { SupabaseSendStore } from "@/lib/outreach/send-store";

export type ActionResult = { ok: true; message: string } | { ok: false; message: string };

const EditSchema = z.object({
  id: z.string().uuid(),
  subject: z.string().trim().min(3, "The subject is too short.").max(200, "The subject is too long."),
  body: z.string().trim().min(20, "The email body is too short.").max(5000, "The email body is too long (5,000 characters max)."),
  recipient_name: z.string().trim().max(120, "The recipient name is too long.").optional().transform((v) => v || null),
  recipient_email: z.string().trim().email("That doesn’t look like a valid email address.").optional().or(z.literal("")).transform((v) => v || null),
});

const EDITABLE = ["generated", "draft_created", "approved"];

const refresh = (id: string) => {
  revalidatePath("/drafts");
  revalidatePath(`/drafts/${id}`);
  revalidatePath("/opportunities");
};

export async function updateDraft(formData: FormData): Promise<ActionResult> {
  const parsed = EditSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Please check the fields and try again." };
  const { id, ...rest } = parsed.data;
  const res = await db().from("outreach").update(rest).eq("id", id).in("status", EDITABLE).select("id");
  if (res.error) return { ok: false, message: "Couldn’t save your changes. Please try again." };
  if (!res.data?.length) return { ok: false, message: "This draft can no longer be edited." };
  refresh(id);
  return { ok: true, message: "Saved." };
}

const TRANSITIONS: Record<string, string[]> = {
  approved: ["generated", "draft_created"],
  rejected: ["generated", "draft_created", "approved"],
  cancelled: ["generated", "draft_created", "approved"],
  // The operator sends from their own mail client; this only records that they did.
  sent: ["approved", "draft_created", "generated"],
};

const DONE: Record<string, string> = { approved: "Approved.", rejected: "Draft rejected.", cancelled: "Draft cancelled.", sent: "Marked as sent." };

export async function changeDraftStatus(draftId: string, to: string): Promise<ActionResult> {
  const id = z.string().uuid().safeParse(draftId);
  if (!id.success || !(to in TRANSITIONS)) return { ok: false, message: "That action isn’t available." };
  const res = await db()
    .from("outreach")
    .update({ status: to, ...(to === "sent" ? { sent_at: new Date().toISOString() } : {}) })
    .eq("id", id.data)
    .in("status", TRANSITIONS[to])
    .select("id");
  if (res.error) return { ok: false, message: "Couldn’t update the draft. Please try again." };
  if (!res.data?.length) return { ok: false, message: "This draft has already changed. Reload to see its current state." };
  refresh(id.data);
  return { ok: true, message: DONE[to] };
}

/** The Send button: one approved draft, one human click, sent through Resend. */
export async function sendDraftEmail(draftId: string): Promise<ActionResult> {
  const id = z.string().uuid().safeParse(draftId);
  if (!id.success) return { ok: false, message: "Invalid draft id." };
  const e = env();
  const result = await sendApprovedDraft(
    { store: new SupabaseSendStore(), config: { apiKey: e.RESEND_API_KEY, fromEmail: e.RESEND_FROM_EMAIL, fromName: e.RESEND_FROM_NAME ?? e.OUTREACH_SENDER_NAME, replyTo: e.RESEND_REPLY_TO } },
    id.data,
  );
  refresh(id.data);
  if (!result.ok) return { ok: false, message: result.message };
  return { ok: true, message: result.warning ?? "Email sent." };
}
