import { z } from "zod";
import { FUNDING_STAGES } from "@/types/domain";
import { BUSINESS_MODEL_OPTIONS, COUNTRY_OPTIONS, CUSTOM_LABEL_PATTERN, CORE_SECTOR_OPTIONS, EXCLUDED_OPTIONS, MAX_AGE_HOUR_OPTIONS, MIN_SCORE_OPTIONS, RECENCY_HOUR_OPTIONS, SUBSECTOR_OPTIONS } from "./options";

/** Values must come from a fixed list (no free text). */
const fixedList = (options: readonly string[], label: string) =>
  z
    .array(z.string())
    .max(options.length)
    .refine((v) => v.every((x) => options.includes(x)), `${label}: only values from the dropdown are allowed`)
    .refine((v) => new Set(v).size === v.length, `${label}: duplicate values`);

/** Dropdown values or vetted custom labels (letters/digits/basic punctuation, 3-60 chars), de-duplicated. */
const listWithCustom = (options: readonly string[], label: string) =>
  z
    .array(z.string().trim())
    .max(40)
    .refine((v) => v.every((x) => options.includes(x) || CUSTOM_LABEL_PATTERN.test(x)), `${label}: custom entries must be 3-60 characters of letters, numbers and basic punctuation`)
    .refine((v) => new Set(v.map((x) => x.toLowerCase())).size === v.length, `${label}: duplicate values`);

const oneOf = (options: readonly number[], label: string) =>
  z.coerce.number().refine((n) => options.includes(n), `${label}: choose one of the offered values`);

export const ThesisInputSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    description: z.string().trim().max(500).nullable().optional(),
    natural_language_thesis: z.string().trim().min(40, "Describe the thesis in at least a couple of sentences").max(6000),
    allowed_countries: fixedList(COUNTRY_OPTIONS, "Geography").refine((v) => v.length >= 1, "At least one country is required"),
    allowed_stages: z.array(z.enum(FUNDING_STAGES)).min(1, "Select at least one funding stage"),
    included_sectors: listWithCustom(CORE_SECTOR_OPTIONS, "Core sectors"),
    preferred_subsectors: listWithCustom(SUBSECTOR_OPTIONS, "Preferred subsectors"),
    excluded_sectors: listWithCustom(EXCLUDED_OPTIONS, "Excluded areas"),
    preferred_business_models: fixedList(BUSINESS_MODEL_OPTIONS, "Business models"),
    max_announcement_age_hours: oneOf(MAX_AGE_HOUR_OPTIONS, "Maximum announcement age"),
    minimum_fit_score: oneOf(MIN_SCORE_OPTIONS, "Minimum fit score"),
    recency_bands: z.array(z.object({ max_hours: oneOf(RECENCY_HOUR_OPTIONS, "Recency hours"), points: z.coerce.number().int().min(0).max(100) })).max(12),
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
