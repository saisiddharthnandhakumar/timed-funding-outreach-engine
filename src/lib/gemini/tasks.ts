import { z } from "zod";
import type { CriterionRow, ThesisRow } from "@/types/domain";
import { truncate } from "@/lib/util/text";
import type { AIService } from "./service";
import { ClassificationSchema, LinkedInDmSchema, OutreachSchema, ProfileSchema, type Classification, type LinkedInDm, type OutreachEmail, type StartupProfile } from "./schemas";

const NO_INVENTION =
  "Use ONLY facts stated in the provided material. If something is not stated, use null (or an empty list). Never guess, infer or invent company details, founders, amounts, dates, investors, traction or customers.";

/* ───────────────────────── Task 1: Funding Article Classifier ───────────────────────── */

export interface ClassifyInput {
  headline: string;
  snippet: string | null;
  articleText: string | null;
  source: string;
  publishedAt: string | null;
}

export function classifyArticle(ai: AIService, input: ClassifyInput): Promise<Classification> {
  const system = `You classify Indian startup-news articles and extract funding facts. ${NO_INVENTION}
Rules:
- is_funding_announcement: true only if the article reports a company that has RAISED/ANNOUNCED a funding round (equity, debt, grant). Not true for IPO filings, acquisitions, layoffs, valuations alone, product launches, opinion pieces, or stock-market news.
- is_roundup: true if the article covers several companies' rounds (e.g. "Funding Wrap", "this week's deals", "top funding rounds"). For roundups set company_name to null.
- company_name: the startup that raised (not the investor).
- is_indian_startup: true if clearly headquartered in or primarily operating from India (Indian city, Indian founders operating in India, INR amounts alone are NOT enough). false if clearly elsewhere. null if unclear. hq_country is the country name in English or null.
- funding_stage must be normalised to one of: ${["pre-seed", "seed", "pre-series-a", "series-a", "series-b", "series-c-plus", "bridge", "debt", "grant", "ipo", "unknown"].join(", ")}. "pre seed", "pre-seed", "angel round" => pre-seed; "seed funding", "seed round", "seed investment", "seed" => seed. "Pre-Series A" => pre-series-a. Series C, D, E... => series-c-plus. Use "unknown" if no stage is stated (do not guess from amount). Put the article's original wording in funding_stage_raw.
- funding_amount is a plain number in the stated currency's major unit (1 crore = 10,000,000; 1 lakh = 100,000; "$2.5M" => 2500000). funding_currency is an ISO code (INR for ₹/Rs, USD for $). Both null if undisclosed.
- investors: names of investing firms/people mentioned as participating; lead_investor if one is named as leading.
- confidence: your 0-1 confidence in the overall extraction.`;
  const prompt = `Source: ${input.source}
Published: ${input.publishedAt ?? "unknown"}
Headline: ${input.headline}
Snippet: ${input.snippet ?? "(none)"}
Article text:
${input.articleText ? truncate(input.articleText, 6000) : "(not available)"}`;
  return ai.generateStructured({ task: "classify_article", system, prompt, schema: ClassificationSchema, temperature: 0 });
}

/* ───────────────────────── Task 2: Startup profile synthesis ───────────────────────── */

export interface ResearchDoc {
  url: string;
  kind: string;
  title: string | null;
  text: string;
}

export function synthesizeProfile(
  ai: AIService,
  input: { companyName: string; hintCountry: string | null; docs: ResearchDoc[] },
): Promise<StartupProfile> {
  const system = `You build a factual startup profile from research documents. ${NO_INVENTION}
- Each document has a URL; list in source_urls only the URLs whose content you actually used.
- "website" must be the company's OWN official website and must appear in the documents; otherwise null.
- founders: only people explicitly described as founders/co-founders; background must be stated in the documents (otherwise null). linkedin_url only if it appears in the documents.
- traction/customers/partnerships: short factual statements exactly as supported (e.g. "Pilots with 3 manufacturers (per Inc42)"). Empty list if none stated.
- sector/subsector: choose a short descriptive label grounded in what the company does (e.g. "Vertical AI", "Robotics", "Consumer fintech").
- business_model: one of B2B, B2C, B2B2C, marketplace, D2C, other — or null if unclear.
- unknowns: list the field names you could not establish (e.g. "traction", "founder_background").`;
  const docs = input.docs
    .map((d, i) => `### Document ${i + 1} [${d.kind}] ${d.url}${d.title ? ` — ${d.title}` : ""}\n${truncate(d.text, 5000)}`)
    .join("\n\n");
  const prompt = `Company: ${input.companyName}${input.hintCountry ? ` (reported country: ${input.hintCountry})` : ""}\n\n${docs}`;
  return ai.generateStructured({ task: "synthesize_profile", system, prompt, schema: ProfileSchema, temperature: 0 });
}

/* ───────────────────────── Task 3: Fit assessment ───────────────────────── */

export interface FitInput {
  profile: StartupProfile;
  funding: { stage: string; amount: number | null; currency: string | null; investors: string[]; ageHours: number };
  thesis: ThesisRow;
  /** Criteria the MODEL must score (deterministic ones are computed in code and excluded). */
  modelCriteria: CriterionRow[];
}

export const FitSchemaFor = (criteria: CriterionRow[]) =>
  z.object({
    criterion_scores: z.object(Object.fromEntries(criteria.map((c) => [c.criterion_key, z.number()]))),
    positive_signals: z.array(z.string()),
    concerns: z.array(z.string()),
    reasoning: z.string(),
    confidence: z.number().min(0).max(1),
  });

export function assessFit(ai: AIService, input: FitInput) {
  const { thesis, modelCriteria } = input;
  const system = `You are an analyst scoring a startup against an accelerator's investment thesis. ${NO_INVENTION}
Score each criterion as an integer from 0 up to its stated maximum — NEVER above the maximum. Judge only on evidence in the profile; missing evidence earns low (not maximum) scores and should be listed under concerns. Do not reward marketing language ("AI-powered") as technical differentiation. Do not output a total or a qualified flag; the application computes those. positive_signals and concerns are short, specific, evidence-based statements (max 6 each). reasoning is 2-4 sentences.`;
  const criteriaText = modelCriteria.map((c) => `- ${c.criterion_key} (max ${c.weight}): ${c.display_name}. ${c.description}`).join("\n");
  const prompt = `ACCELERATOR THESIS (version ${thesis.version}):
${thesis.natural_language_thesis}

Target countries: ${thesis.allowed_countries.join(", ") || "any"}
Core sectors: ${thesis.included_sectors.join(", ") || "-"}
Preferred subsectors: ${thesis.preferred_subsectors.join(", ") || "-"}
Excluded areas: ${thesis.excluded_sectors.join(", ") || "-"}
Preferred business models: ${thesis.preferred_business_models.join(", ") || "-"}

CRITERIA TO SCORE:
${criteriaText}

FUNDING EVENT:
Stage: ${input.funding.stage}; Amount: ${input.funding.amount ?? "undisclosed"} ${input.funding.currency ?? ""}; Investors: ${input.funding.investors.join(", ") || "unknown"}; Announced ${input.funding.ageHours.toFixed(1)}h ago.

STARTUP PROFILE (JSON, null = unknown):
${JSON.stringify(input.profile, null, 1)}`;
  return ai.generateStructured({ task: "assess_fit", system, prompt, schema: FitSchemaFor(modelCriteria), temperature: 0 });
}

/* ───────────────────────── Task 4: Outreach generation ───────────────────────── */

export interface OutreachInput {
  senderName: string;
  acceleratorName: string;
  profile: StartupProfile;
  funding: { stage: string; amount: number | null; currency: string | null; investors: string[] };
  founderName: string | null;
  positiveSignals: string[];
  thesisSummary: string;
}

export function generateOutreach(ai: AIService, input: OutreachInput): Promise<OutreachEmail> {
  const system = `You write concise, founder-friendly first-touch emails for a startup accelerator. ${NO_INVENTION}
Style: professional, warm, specific, non-spammy, no exaggerated praise, no buzzword stacking, no generic mail-merge phrasing. 110-170 words. Plain text with 4-5 short paragraphs separated by a blank line (use \n\n between paragraphs, greeting and sign-off on their own lines), no markdown, no bullet lists.
Structure: (1) congratulate on the specific round (stage and amount if known); (2) one or two sentences that prove you understood what they build, using concrete product/customer/technology details from the profile; (3) one sentence on why they look aligned with the accelerator (grounded in the provided fit signals); (4) a low-pressure call to action for a short conversation.
Greeting: use "Hi {founderName}," only if a founder name is provided, otherwise "Hi {Company} team,". Sign off with the sender name. Never claim to have met, used the product, or know the founder personally. Do not mention scores or internal evaluation. No placeholders in brackets.`;
  const prompt = `Sender: ${input.senderName}, ${input.acceleratorName}
Company: ${input.profile.company_name}
Founder to address (verified): ${input.founderName ?? "none — address the team"}
Round: ${input.funding.stage}${input.funding.amount ? `, ${input.funding.amount} ${input.funding.currency ?? ""}` : ""}${input.funding.investors.length ? `, investors: ${input.funding.investors.join(", ")}` : ""}
Fit signals: ${input.positiveSignals.join("; ") || "n/a"}
Accelerator focus: ${truncate(input.thesisSummary, 500)}

PROFILE (null/empty = unknown, do not mention):
${JSON.stringify(input.profile, null, 1)}`;
  return ai.generateStructured({ task: "generate_outreach", system, prompt, schema: OutreachSchema, temperature: 0.6 });
}

/* ───────────────────────── Task 5: LinkedIn cold DM ───────────────────────── */

export interface LinkedInDmInput {
  senderName: string;
  acceleratorName: string;
  profile: StartupProfile;
  funding: { stage: string; amount: number | null; currency: string | null };
  recipientName: string;
  recipientRole: string | null;
  positiveSignals: string[];
}

export function generateLinkedInDm(ai: AIService, input: LinkedInDmInput): Promise<LinkedInDm> {
  const system = `You write very short, warm LinkedIn first-touch messages for a startup accelerator. ${NO_INVENTION}
Hard limit: 280 characters including spaces, plain text, no markdown, no emojis, no hashtags, no links, no placeholders in brackets.
Structure: "Hi {firstName}," then one clause congratulating them on the specific round, one clause showing you understood what they build (a concrete product detail from the profile), and a low-pressure ask to connect or chat briefly. Sign off with the sender's first name. Never claim to know them, to have used the product, or to have met. Do not mention scores.`;
  const prompt = `Sender: ${input.senderName}, ${input.acceleratorName}
Recipient: ${input.recipientName}${input.recipientRole ? ` (${input.recipientRole})` : ""} at ${input.profile.company_name}
Round: ${input.funding.stage}${input.funding.amount ? `, ${input.funding.amount} ${input.funding.currency ?? ""}` : ""}
Fit signals: ${input.positiveSignals.join("; ") || "n/a"}

PROFILE (null/empty = unknown, do not mention):
${JSON.stringify({ product: input.profile.product, description: input.profile.description, target_customer: input.profile.target_customer, technology: input.profile.technology }, null, 1)}`;
  return ai.generateStructured({ task: "generate_linkedin_dm", system, prompt, schema: LinkedInDmSchema, temperature: 0.6 });
}
