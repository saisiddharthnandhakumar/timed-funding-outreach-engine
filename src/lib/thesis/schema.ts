import { z } from "zod";
import { FUNDING_STAGES } from "@/types/domain";

const tags = z.array(z.string().trim().min(1).max(80)).max(40);

export const ThesisInputSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    description: z.string().trim().max(500).nullable().optional(),
    natural_language_thesis: z.string().trim().min(40, "Describe the thesis in at least a couple of sentences").max(6000),
    allowed_countries: tags.min(1, "At least one country is required"),
    allowed_stages: z.array(z.enum(FUNDING_STAGES)).min(1, "Select at least one funding stage"),
    included_sectors: tags,
    preferred_subsectors: tags,
    excluded_sectors: tags,
    preferred_business_models: tags,
    max_announcement_age_hours: z.coerce.number().int().min(1).max(168),
    minimum_fit_score: z.coerce.number().int().min(0).max(100),
    recency_bands: z.array(z.object({ max_hours: z.coerce.number().positive().max(168), points: z.coerce.number().int().min(0).max(100) })).max(12),
    stage_points: z.record(z.string(), z.coerce.number().int().min(0).max(100)),
    criteria: z
      .array(
        z.object({
          criterion_key: z.string().regex(/^[a-z][a-z0-9_]*$/),
          display_name: z.string().trim().min(1).max(80),
          description: z.string().trim().max(1200),
          weight: z.coerce.number().int().min(0).max(100),
          enabled: z.boolean(),
          sort_order: z.coerce.number().int().min(0).max(100),
        }),
      )
      .min(1),
  })
  .superRefine((v, ctx) => {
    const total = v.criteria.filter((c) => c.enabled).reduce((s, c) => s + c.weight, 0);
    if (total !== 100) ctx.addIssue({ code: "custom", path: ["criteria"], message: `Enabled scoring weights must total 100 (currently ${total})` });
  });

export type ThesisInput = z.infer<typeof ThesisInputSchema>;
