"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getAI } from "@/lib/ai";
import { enrichOne } from "@/lib/contacts";

const Id = z.string().uuid();

/** Manually re-run founder-first contact discovery for one researched startup (ignores the re-enrichment interval). */
export async function rerunContactEnrichment(startupId: string): Promise<{ message: string }> {
  const id = Id.safeParse(startupId);
  if (!id.success) return { message: "Invalid startup id." };
  try {
    const o = await enrichOne(getAI(), id.data, { force: true });
    revalidatePath(`/opportunities/${id.data}`);
    revalidatePath("/opportunities");
    if (o.status === "failed") return { message: `Contact search failed: ${o.warnings[0] ?? "see the system event log"}` };
    return { message: o.preferredEmail ? `Found ${o.preferredEmail}` : o.preferredType === "contact_form" ? "Only a public contact form was found." : "No reliable contact found." };
  } catch (err) {
    return { message: `Contact search failed: ${err instanceof Error ? err.message : String(err)}` };
  }
}
