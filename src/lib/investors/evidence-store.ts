import { db } from "@/lib/supabase/admin";
import { sha256 } from "@/lib/util/text";
import type { EvidenceDraft } from "./evidence";

/** Idempotent: the same fact from the same source/url updates in place, so re-running never duplicates rows. */
export async function saveEvidence(args: { startupId: string; roundId?: string | null; sourceId?: string | null; drafts: EvidenceDraft[] }): Promise<number> {
  if (!args.drafts.length) return 0;
  const rows = args.drafts.map((d) => ({
    startup_id: args.startupId,
    funding_round_id: args.roundId ?? null,
    field_key: d.fieldKey,
    value_json: d.value ?? null,
    source_id: args.sourceId ?? null,
    source_url: d.sourceUrl,
    evidence_type: d.evidenceType,
    confidence: d.confidence,
    conflict_json: d.conflict,
    dedupe_key: sha256(args.startupId, args.roundId ?? "", d.fieldKey, d.discriminator ?? "", d.sourceKey, d.sourceUrl ?? ""),
    observed_at: new Date().toISOString(),
  }));
  const { error } = await db().from("research_evidence").upsert(rows, { onConflict: "dedupe_key" });
  if (error) throw new Error(`save evidence: ${error.message}`);
  return rows.length;
}
