"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/supabase/admin";
import { ThesisInputSchema } from "@/lib/thesis/schema";

export type SaveResult = { ok: true; message: string } | { ok: false; errors: string[] };

/**
 * Saves the thesis as a NEW immutable version (atomic RPC) and activates it.
 * Future assessments read the active row at scoring time; past assessments keep
 * their own thesis_id/version/snapshot and are never modified.
 */
export async function saveThesis(input: unknown): Promise<SaveResult> {
  const parsed = ThesisInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, errors: parsed.error.issues.map((i) => `${i.path.join(".") || "form"}: ${i.message}`) };
  const { error } = await db().rpc("save_thesis_version", { p_payload: parsed.data });
  if (error) return { ok: false, errors: [error.message] };
  revalidatePath("/settings");
  return { ok: true, message: "Saved as a new thesis version. All future assessments will use it." };
}
