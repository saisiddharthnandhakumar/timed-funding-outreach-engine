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
  GEMINI_MODEL: optional,
  CRON_SECRET: optional,
  ADMIN_PASSWORD: optional,
  GOOGLE_CLIENT_ID: optional,
  GOOGLE_CLIENT_SECRET: optional,
  GOOGLE_REFRESH_TOKEN: optional,
  OUTREACH_SENDER_NAME: optional,
  ACCELERATOR_NAME: optional,
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
