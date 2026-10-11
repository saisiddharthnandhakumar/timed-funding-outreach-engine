import { db, unwrap } from "@/lib/supabase/admin";
import type { AIService } from "@/lib/gemini/service";
import { assessFit } from "@/lib/gemini/tasks";
import type { StartupProfile } from "@/lib/gemini/schemas";
import { computeAssessment, modelCriteriaOf } from "./compute";
import { loadActiveScoringConfig } from "./config";

export interface AssessmentRow {
  id: string;
  total_score: number;
  qualified: boolean;
  thesis_version: number;
  criterion_scores_json: Record<string, number>;
  positive_signals: string[];
  concerns: string[];
  reasoning: string | null;
}

/**
 * Gemini Task 3 + application-side validation. Reads the ACTIVE thesis from
 * Supabase at call time and stores an immutable assessment with a snapshot of
 * the exact criteria/threshold used, so later thesis edits never alter history.
 */
export async function assessRound(
  ai: AIService,
  args: {
    startupId: string;
    roundId: string;
    profile: StartupProfile;
    stage: string;
    amount: number | null;
    currency: string | null;
    investors: string[];
    announcedAt: Date;
    now?: Date;
  },
): Promise<{ assessment: AssessmentRow; warnings: string[]; reused: boolean }> {
  const { thesis, criteria } = await loadActiveScoringConfig();

  const existing = await db()
    .from("fit_assessments")
    .select("id,total_score,qualified,thesis_version,criterion_scores_json,positive_signals,concerns,reasoning")
    .eq("funding_round_id", args.roundId)
    .eq("thesis_id", thesis.id)
    .maybeSingle<AssessmentRow>();
  if (existing.data) return { assessment: existing.data, warnings: [], reused: true };

  const now = args.now ?? new Date();
  const ageHours = Math.max(0, (now.getTime() - args.announcedAt.getTime()) / 3_600_000);
  const modelCriteria = modelCriteriaOf(criteria, thesis);

  const out = await assessFit(ai, {
    profile: args.profile,
    funding: { stage: args.stage, amount: args.amount, currency: args.currency, investors: args.investors, ageHours },
    thesis,
    modelCriteria,
  });

  const computed = computeAssessment({
    thesis,
    criteria,
    modelScores: out.criterion_scores as Record<string, unknown>,
    stage: args.stage,
    ageHours,
  });

  const row = unwrap(
    await db()
      .from("fit_assessments")
      .insert({
        startup_id: args.startupId,
        funding_round_id: args.roundId,
        thesis_id: thesis.id,
        thesis_version: thesis.version,
        total_score: computed.total_score,
        qualified: computed.qualified,
        criterion_scores_json: computed.criterion_scores,
        positive_signals: out.positive_signals.slice(0, 8),
        concerns: out.concerns.slice(0, 8),
        reasoning: out.reasoning,
        confidence: out.confidence,
        scoring_snapshot: {
          minimum_fit_score: thesis.minimum_fit_score,
          criteria: criteria.filter((c) => c.enabled).map((c) => ({ key: c.criterion_key, name: c.display_name, weight: c.weight })),
          recency_bands: thesis.recency_bands,
          stage_points: thesis.stage_points,
          age_hours: Number(ageHours.toFixed(2)),
          warnings: computed.warnings,
        },
        raw_model_output: out,
        model_name: ai.modelName,
      })
      .select("id,total_score,qualified,thesis_version,criterion_scores_json,positive_signals,concerns,reasoning")
      .single<AssessmentRow>(),
    "insert fit assessment",
  );
  return { assessment: row, warnings: computed.warnings, reused: false };
}
