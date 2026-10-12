import { z } from "zod";

/**
 * Environment access. Everything is validated lazily so that `next build` and
 * unit tests don't need real credentials; each getter throws a precise message
 * naming the missing variable when the feature is actually used.
 */
const blank = (v: unknown) => (typeof v === "string" && v.trim() === "" ? undefined : v);
const optional = z.preprocess(blank, z.string().min(1).optional());

const schema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: optional,
  SUPABASE_SERVICE_ROLE_KEY: optional,
  GOOGLE_GENERATIVE_AI_API_KEY: optional,
  /** Optional backup AI provider, used only when Gemini is out of quota or down. */
  OPENROUTER_API_KEY: optional,
  OPENROUTER_MODEL: optional,
  GEMINI_MODEL: optional,
  CRON_SECRET: optional,
  GOOGLE_CLIENT_ID: optional,
  GOOGLE_CLIENT_SECRET: optional,
  GOOGLE_REFRESH_TOKEN: optional,
  OUTREACH_SENDER_NAME: optional,
  ACCELERATOR_NAME: optional,
  RESEND_API_KEY: optional,
  RESEND_FROM_EMAIL: optional,
  RESEND_FROM_NAME: optional,
  RESEND_REPLY_TO: optional,
  GITHUB_TOKEN: optional,
  HUNTER_API_KEY: optional,
  /** Optional web search: Serper (find pages) and Tavily (research context). Each is capped per month. */
  SERPER_API_KEY: optional,
  TAVILY_API_KEY: optional,
  SERPER_MONTHLY_BUDGET: z.preprocess(blank, z.coerce.number().int().min(0).max(1000000).default(1500)),
  TAVILY_MONTHLY_BUDGET: z.preprocess(blank, z.coerce.number().int().min(0).max(1000000).default(600)),
  TELEGRAM_BOT_TOKEN: optional,
  TELEGRAM_CHAT_ID: optional,
  /** Public URL of the deployed app; used for links inside Telegram messages. */
  APP_URL: optional,
  /** Length of the outreach window, counted from the funding announcement. */
  OUTREACH_WINDOW_HOURS: z.preprocess(blank, z.coerce.number().min(1).max(168).default(24)),
  /** How long before the window closes the "time is running out" alert is sent. */
  TELEGRAM_REMINDER_LEAD_HOURS: z.preprocess(blank, z.coerce.number().min(0.25).max(48).default(2)),
  CONTACT_MAX_PAGES: z.preprocess(blank, z.coerce.number().int().min(1).max(20).default(8)),
  CONTACT_CONCURRENCY: z.preprocess(blank, z.coerce.number().int().min(1).max(6).default(3)),
  CONTACT_REENRICH_DAYS: z.preprocess(blank, z.coerce.number().min(0).max(365).default(14)),
  CONTACT_SEARCH_MONTHLY_BUDGET: z.preprocess(blank, z.coerce.number().int().min(0).max(100000).default(400)),
  CONTACT_VERIFIER_MONTHLY_BUDGET: z.preprocess(blank, z.coerce.number().int().min(0).max(100000).default(40)),
  CONTACT_HUNTER_FINDER_MONTHLY_BUDGET: z.preprocess(blank, z.coerce.number().int().min(0).max(100000).default(20)),
  CONTACT_BACKFILL_PER_RUN: z.preprocess(blank, z.coerce.number().int().min(0).max(50).default(5)),
  PIPELINE_MAX_ARTICLES_PER_RUN: z.preprocess(blank, z.coerce.number().int().min(1).max(500).default(40)),
  PIPELINE_CONCURRENCY: z.preprocess(blank, z.coerce.number().int().min(1).max(8).default(2)),
  PIPELINE_TIME_BUDGET_SECONDS: z.preprocess(blank, z.coerce.number().int().min(20).max(800).default(240)),
});

export type Env = z.infer<typeof schema>;

export function env(): Env {
  return schema.parse(process.env);
}

export function requireEnv<K extends keyof Env>(key: K): NonNullable<Env[K]> {
  const value = env()[key];
  if (value === undefined || value === null || value === "") {
    throw new Error(`Missing required environment variable ${String(key)} (see .env.example)`);
  }
  return value as NonNullable<Env[K]>;
}

export function hasSupabaseEnv(): boolean {
  const e = env();
  return Boolean(e.NEXT_PUBLIC_SUPABASE_URL && e.SUPABASE_SERVICE_ROLE_KEY);
}

export function hasGmailEnv(): boolean {
  const e = env();
  return Boolean(e.GOOGLE_CLIENT_ID && e.GOOGLE_CLIENT_SECRET && e.GOOGLE_REFRESH_TOKEN);
}
