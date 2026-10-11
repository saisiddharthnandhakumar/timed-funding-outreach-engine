import { z } from "zod";
import { FUNDING_STAGES } from "@/types/domain";

/** Gemini Task 1 — funding article classification + extraction. */
export const ClassificationSchema = z.object({
  is_funding_announcement: z.boolean(),
  /** True when the article covers several companies (weekly wraps, listicles) rather than one round. */
  is_roundup: z.boolean(),
  company_name: z.string().nullable(),
  is_indian_startup: z.boolean().nullable(),
  hq_country: z.string().nullable(),
  hq_city: z.string().nullable(),
  funding_stage: z.enum(FUNDING_STAGES),
  funding_stage_raw: z.string().nullable(),
  funding_amount: z.number().nonnegative().nullable(),
  funding_currency: z.string().nullable(),
  investors: z.array(z.string()),
  lead_investor: z.string().nullable(),
  one_line_description: z.string().nullable(),
  confidence: z.number().min(0).max(1),
});
export type Classification = z.infer<typeof ClassificationSchema>;

/** Gemini Task 2 — startup profile / research synthesis. Unknown = null / empty, never invented. */
export const ProfileSchema = z.object({
  company_name: z.string(),
  website: z.string().nullable(),
  description: z.string().nullable(),
  sector: z.string().nullable(),
  subsector: z.string().nullable(),
  business_model: z.string().nullable(),
  hq_city: z.string().nullable(),
  hq_country: z.string().nullable(),
  founded_year: z.number().int().nullable(),
  founders: z.array(
    z.object({
      name: z.string(),
      role: z.string().nullable(),
      background: z.string().nullable(),
      linkedin_url: z.string().nullable(),
    }),
  ),
  product: z.string().nullable(),
  target_customer: z.string().nullable(),
  technology: z.string().nullable(),
  traction: z.array(z.string()),
  customers: z.array(z.string()),
  partnerships: z.array(z.string()),
  funding_history: z.array(z.string()),
  market: z.string().nullable(),
  competitive_differentiation: z.string().nullable(),
  source_urls: z.array(z.string()),
  unknowns: z.array(z.string()),
});
export type StartupProfile = z.infer<typeof ProfileSchema>;

/** Gemini Task 4 — outreach email. */
export const OutreachSchema = z.object({
  subject: z.string().min(5).max(140),
  body: z.string().min(80).max(2500),
});
export type OutreachEmail = z.infer<typeof OutreachSchema>;
