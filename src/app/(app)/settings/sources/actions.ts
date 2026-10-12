"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/supabase/admin";

export async function toggleSource(formData: FormData) {
  const id = z.string().uuid().safeParse(formData.get("id"));
  if (!id.success) return;
  const enabled = formData.get("enabled") === "true";
  // A source whose adapter hasn't been verified can't be switched on (resuming one that works is always fine).
  const q = db().from("sources").update({ enabled }).eq("id", id.data);
  await (enabled ? q.eq("adapter_status", "verified") : q);
  revalidatePath("/settings/sources");
  revalidatePath("/settings/system");
}
