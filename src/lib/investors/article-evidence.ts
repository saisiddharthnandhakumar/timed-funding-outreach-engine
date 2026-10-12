import { db } from "@/lib/supabase/admin";
import type { Classification } from "@/lib/gemini/schemas";
import { saveEvidence } from "./evidence-store";
import { confidenceFor, fundingConflict, type EvidenceDraft, type EvidenceType } from "./evidence";

interface SourceMeta {
  id: string;
  key: string;
  name: string;
  source_type: string | null;
}

const metaCache = new Map<string, { at: number; meta: SourceMeta | null }>();
async function sourceMeta(id: string): Promise<SourceMeta | null> {
  const hit = metaCache.get(id);
  if (hit && Date.now() - hit.at < 5 * 60_000) return hit.meta;
  const { data } = await db().from("sources").select("id,key,name,source_type").eq("id", id).maybeSingle();
  const meta = (data as SourceMeta | null) ?? null;
  metaCache.set(id, { at: Date.now(), meta });
  return meta;
}

/**
 * What one report of a round contributes beyond "an article exists": its amount and stage as attributed evidence
 * (so two sources disagreeing on "$3M vs $3.2M" is visible, not silently resolved), and, when the report comes
 * from an investor's own site, a confirmed investor relationship. Never changes the round itself.
 */
export async function recordArticleEvidence(args: {
  sourceId: string;
  article: { url: string };
  classification: Classification;
  startupId: string;
  roundId: string;
}): Promise<void> {
  const meta = await sourceMeta(args.sourceId);
  if (!meta) return;
  const c = args.classification;
  const type: EvidenceType = meta.source_type === "investor" ? "investor_first_party" : "reputable_media";

  const drafts: EvidenceDraft[] = [];
  const add = (fieldKey: string, value: unknown) => drafts.push({ fieldKey, value, evidenceType: type, sourceKey: meta.key, sourceUrl: args.article.url, confidence: confidenceFor(type, 1), conflict: null });
  if (c.funding_amount != null) add("funding_amount", { amount: c.funding_amount, currency: c.funding_currency });
  if (c.funding_stage && c.funding_stage !== "unknown") add("funding_stage", c.funding_stage);
  await saveEvidence({ startupId: args.startupId, roundId: args.roundId, sourceId: meta.id, drafts });

  await markDisagreements(args.roundId);

  if (meta.source_type === "investor") await confirmInvestor(args.roundId, meta.name, args.article.url, c.lead_investor);
}

/** Recompute, per field of the round, whether the sources agree; stamp conflict_json (or clear it) and agreement-based confidence. */
async function markDisagreements(roundId: string) {
  const { data } = await db().from("research_evidence").select("id,field_key,value_json,evidence_type,confidence,source_id,sources(key)").eq("funding_round_id", roundId).in("field_key", ["funding_amount", "funding_stage"]);
  const rows = (data ?? []) as unknown as { id: string; field_key: "funding_amount" | "funding_stage"; value_json: unknown; evidence_type: EvidenceType; source_id: string | null; sources: { key: string } | null }[];
  for (const field of ["funding_amount", "funding_stage"] as const) {
    const group = rows.filter((r) => r.field_key === field);
    if (!group.length) continue;
    const facts = group.map((r) => ({ value: r.value_json, sourceKey: r.sources?.key ?? "unknown", evidenceType: r.evidence_type }));
    const conflict = fundingConflict(field, facts);
    const agreeing = new Set(group.map((r) => r.source_id)).size;
    for (const r of group) {
      await db()
        .from("research_evidence")
        .update({
          conflict_json: conflict ? { field, values: conflict } : null,
          confidence: conflict ? "low" : confidenceFor(r.evidence_type, agreeing),
        })
        .eq("id", r.id);
    }
  }
}

/** An investor announcing its own investment confirms the link; existing is_lead flags from news are left alone. */
async function confirmInvestor(roundId: string, investorName: string, url: string, leadInvestor: string | null) {
  const found = await db().from("investors").select("id").ilike("name", investorName.replace(/[%_]/g, "\\$&")).maybeSingle<{ id: string }>();
  let id = found.data?.id;
  if (!id) {
    const ins = await db().from("investors").insert({ name: investorName }).select("id").single<{ id: string }>();
    id = ins.data?.id ?? (await db().from("investors").select("id").ilike("name", investorName.replace(/[%_]/g, "\\$&")).maybeSingle<{ id: string }>()).data?.id;
  }
  if (!id) return;
  const existing = await db().from("funding_round_investors").select("investor_id").eq("funding_round_id", roundId).eq("investor_id", id).maybeSingle();
  if (existing.data) {
    await db().from("funding_round_investors").update({ confirmed_by_investor_site: true, evidence_url: url }).eq("funding_round_id", roundId).eq("investor_id", id);
  } else {
    await db().from("funding_round_investors").insert({ funding_round_id: roundId, investor_id: id, is_lead: !!leadInvestor && leadInvestor.toLowerCase() === investorName.toLowerCase(), confirmed_by_investor_site: true, evidence_url: url });
  }
}
