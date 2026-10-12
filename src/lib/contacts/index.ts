import { db } from "@/lib/supabase/admin";
import { env } from "@/lib/env";
import type { AIService } from "@/lib/gemini/service";
import type { PipelineLogger } from "@/lib/pipeline/logger";
import { SupabaseBudget } from "./budget";
import { GithubProvider, realGithubFetch } from "./github";
import { defaultFetcher } from "./http";
import { enrichMany, enrichStartupContacts, type ContactDeps, type ContactOutcome } from "./pipeline";
import { RobotsGuard } from "./robots";
import { GroundedWebSearch } from "./search";
import { SupabaseContactStore } from "./storage";
import { HunterVerifier, MxChecker } from "./verify";
import { OUTREACH_SAFE, type VerificationStatus } from "./types";

export type { ContactOutcome } from "./pipeline";

/** Production wiring. Optional providers (GitHub token, Hunter) are enabled only when their env vars exist. */
export function createContactDeps(ai: AIService, log?: PipelineLogger): ContactDeps {
  const e = env();
  const budget = new SupabaseBudget();
  const robots = new RobotsGuard(defaultFetcher);
  return {
    store: new SupabaseContactStore(),
    fetcher: defaultFetcher,
    robots,
    mx: new MxChecker(),
    github: new GithubProvider(realGithubFetch(e.GITHUB_TOKEN)),
    search: new GroundedWebSearch(ai, defaultFetcher, robots, budget, { monthlyLimit: e.CONTACT_SEARCH_MONTHLY_BUDGET, maxPages: 4 }),
    verifier: e.HUNTER_API_KEY ? new HunterVerifier(e.HUNTER_API_KEY) : null,
    budget,
    config: { maxPages: e.CONTACT_MAX_PAGES, reenrichDays: e.CONTACT_REENRICH_DAYS, verifierMonthlyLimit: e.CONTACT_VERIFIER_MONTHLY_BUDGET, maxVerificationsPerCompany: 3 },
    log: log ? (type, message, meta) => log.event("startup", null, type, message, meta) : undefined,
  };
}

export async function enrichOne(ai: AIService, startupId: string, opts: { force?: boolean; log?: PipelineLogger } = {}): Promise<ContactOutcome> {
  return enrichStartupContacts(createContactDeps(ai, opts.log), startupId, { force: opts.force });
}

export async function enrichBatch(ai: AIService, ids: string[], opts: { force?: boolean; deadline?: number; log?: PipelineLogger; onDone?: (o: ContactOutcome) => void } = {}): Promise<ContactOutcome[]> {
  return enrichMany(createContactDeps(ai, opts.log), ids, { concurrency: env().CONTACT_CONCURRENCY, force: opts.force, deadline: opts.deadline, onDone: opts.onDone });
}

/** Qualified startups that have never been through contact enrichment (backfill for earlier runs / skipped by the time budget). */
export async function pendingQualifiedStartups(limit: number): Promise<string[]> {
  const rows = (await db().from("fit_assessments").select("startup_id,startups!inner(contact_status)").eq("qualified", true).eq("startups.contact_status", "pending").limit(limit * 3)).data as
    | { startup_id: string }[]
    | null;
  return [...new Set((rows ?? []).map((r) => r.startup_id))].slice(0, limit);
}

/** Preferred, outreach-safe recipient for a startup; null when none (never a guessed address). Never throws. */
export async function preferredRecipient(startupId: string): Promise<{ email: string; name: string | null } | null> {
  try {
    const { data } = await db()
      .from("startup_contacts")
      .select("email,founder_name,kind,verification_status")
      .eq("startup_id", startupId)
      .eq("is_preferred", true)
      .not("email", "is", null)
      .maybeSingle<{ email: string; founder_name: string | null; kind: string; verification_status: VerificationStatus }>();
    if (!data || !OUTREACH_SAFE.has(data.verification_status)) return null;
    return { email: data.email, name: data.kind === "founder" ? data.founder_name : null };
  } catch {
    return null; // table not migrated yet, or transient error: draft simply has no recipient
  }
}
