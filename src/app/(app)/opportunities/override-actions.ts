"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { overrideFilteredRound, type OverrideResult } from "@/lib/pipeline/override";

/** "Pursue anyway": pull a filtered-out announcement back in and draft outreach for it. */
export async function pursueFilteredRound(roundId: string): Promise<OverrideResult> {
  const id = z.string().uuid().safeParse(roundId);
  if (!id.success) return { ok: false, message: "Invalid announcement id." };
  const result = await overrideFilteredRound(id.data);
  revalidatePath("/opportunities");
  revalidatePath("/today");
  revalidatePath("/drafts");
  return result;
}
