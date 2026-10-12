"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { overrideFilteredArticle, overrideFilteredRound, type OverrideResult } from "@/lib/pipeline/override";

/** "Pursue anyway": pull a filtered-out announcement back in and draft outreach for it. */
export async function pursueFiltered(kind: "round" | "article", itemId: string): Promise<OverrideResult> {
  const id = z.string().uuid().safeParse(itemId);
  if (!id.success) return { ok: false, message: "Invalid announcement id." };
  const result = await (kind === "round" ? overrideFilteredRound(id.data) : overrideFilteredArticle(id.data));
  revalidatePath("/opportunities");
  revalidatePath("/today");
  revalidatePath("/drafts");
  return result;
}
