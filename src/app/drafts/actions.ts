"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/supabase/admin";

const EditSchema = z.object({
  id: z.string().uuid(),
  subject: z.string().trim().min(3).max(200),
  body: z.string().trim().min(20).max(5000),
  recipient_name: z.string().trim().max(120).optional().transform((v) => v || null),
  recipient_email: z.string().trim().email().optional().or(z.literal("")).transform((v) => v || null),
});

const EDITABLE = ["generated", "draft_created", "approved"];

export async function updateDraft(formData: FormData) {
  const parsed = EditSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return;
  const { id, ...rest } = parsed.data;
  await db().from("outreach").update(rest).eq("id", id).in("status", EDITABLE);
  revalidatePath("/drafts");
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
  revalidatePath("/drafts");
}
