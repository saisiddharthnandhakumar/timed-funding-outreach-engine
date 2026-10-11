"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/supabase/admin";

export async function toggleSource(formData: FormData) {
  const id = z.string().uuid().safeParse(formData.get("id"));
  if (!id.success) return;
  const enabled = formData.get("enabled") === "true";
  await db().from("sources").update({ enabled }).eq("id", id.data);
  revalidatePath("/sources");
}
