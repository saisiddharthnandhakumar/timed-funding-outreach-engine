import { db, unwrap } from "@/lib/supabase/admin";
import type { CriterionRow, ThesisRow } from "@/types/domain";
import { assertWeightsTotal100 } from "./compute";

export interface ActiveScoringConfig {
  thesis: ThesisRow;
  criteria: CriterionRow[];
}

/** Always read from Supabase at call time — nothing about the thesis is cached or hardcoded in code. */
export async function loadActiveScoringConfig(): Promise<ActiveScoringConfig> {
  const thesis = unwrap(
    await db().from("accelerator_theses").select("*").eq("active", true).maybeSingle<ThesisRow>(),
    "load active thesis",
  );
  if (!thesis) throw new Error("No active accelerator thesis found in Supabase (run the seed migration or save one in Settings).");
  const criteria = unwrap(
    await db().from("scoring_criteria").select("*").eq("thesis_id", thesis.id).order("sort_order"),
    "load scoring criteria",
  ) as CriterionRow[];
  assertWeightsTotal100(criteria);
  return { thesis, criteria };
}
