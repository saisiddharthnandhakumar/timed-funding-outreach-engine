import { randomUUID } from "node:crypto";
import { db, unwrap } from "@/lib/supabase/admin";
import { env } from "@/lib/env";
import type { AIService } from "@/lib/gemini/service";
import { classifyArticle } from "@/lib/gemini/tasks";
import type { Classification, StartupProfile } from "@/lib/gemini/schemas";
import { createAdapter as defaultCreateAdapter } from "@/lib/sources/registry";
import type { FundingSourceAdapter } from "@/lib/sources/types";
import { fetchPage } from "@/lib/sources/article-text";
import { SupabaseDedupeRepository, SupabaseOutreachLookup } from "@/lib/deduplication/supabase-repo";
import { resolveStartupAndRound } from "@/lib/deduplication/resolve";
import { persistEnrichment, researchStartup } from "@/lib/research/enrich";
import { assessRound } from "@/lib/scoring/assess";
import { loadActiveScoringConfig } from "@/lib/scoring/config";
import { createOutreachDraft } from "@/lib/outreach/generate";
import { enrichBatch, enrichOne, pendingQualifiedStartups, type ContactOutcome } from "@/lib/contacts";
import { hasPriorOutreach } from "@/lib/outreach/guard";
import { selectDraftProvider } from "@/lib/outreach/providers";
import type { DraftProvider } from "@/lib/outreach/providers/types";
import { notifyDraftReadySafely, runTelegramSweep, telegramDeps } from "@/lib/telegram/notify";
import { canonicalizeUrl, errorMessage, mapLimit } from "@/lib/util/text";
import type { RejectionReason, SourceRow } from "@/types/domain";
import { evaluateHardFilters, passesGeography, type HardFilterConfig } from "./filters";
import { PipelineLogger } from "./logger";
import { ProgressTracker } from "./progress";
import { looksLikeFundingNews } from "./prefilter";

export interface PipelineDeps {
  ai: AIService;
  createAdapter?: (row: SourceRow) => FundingSourceAdapter;
  fetchArticleText?: (url: string) => Promise<{ text: string; links: { href: string; text: string }[] }>;
  draftProvider?: DraftProvider;
  now?: () => Date;
  /** Founder-first contact discovery for a qualified startup (default: real providers). Tests inject a fake. */
  enrichContacts?: (startupId: string) => Promise<ContactOutcome | null>;
}

export interface RunOptions {
  trigger: "manual" | "cron" | "cli" | "test";
  /** Ignore each source's poll interval (manual runs). */
  force?: boolean;
  maxArticles?: number;
  sourceKeys?: string[];
  /** Absolute epoch ms after which no new item is started. */
  deadline?: number;
  /** Skip ingestion and only process already-stored pending articles. */
  skipIngest?: boolean;
  /**
   * REPLAY MODE (testing only): treat articles up to N hours old as eligible, WITHOUT changing the
   * stored thesis. Used to exercise the full funnel on real-but-older articles when nothing
   * qualifies inside the live window. Never used by cron/manual runs.
   */
  replayMaxAgeHours?: number;
}

export interface TraceRow {
  source: string;
  article: string;
  url: string;
  publishedAt: string | null;
  firstSeenAt: string | null;
  classification: string;
  company: string | null;
  stage: string | null;
  eligibility: string;
  fitScore: number | null;
  draft: string;
}

export interface RunSummary {
  runId: string | null;
  /** Set (with status "skipped") when another run owns the lock; no run row is created and no AI is called. */
  skipped?: "already_running";
  status: "completed" | "partial" | "failed" | "skipped";
  sourcesPolled: number;
  articlesFound: number;
  articlesNew: number;
  articlesProcessed: number;
  fundingEvents: number;
  qualified: number;
  drafts: number;
  errors: { scope: string; message: string }[];
  trace: TraceRow[];
}

/** Extra lease time beyond the run's own deadline: an in-flight item (e.g. a ~30 s draft) may finish after it. */
const LOCK_GRACE_SECONDS = 75;
const MIN_CONFIDENCE = 0.5;
const MAX_ROUND_ATTEMPTS = 3;

interface ArticleRow {
  id: string;
  source_id: string;
  source_url: string;
  canonical_url: string;
  headline: string;
  snippet: string | null;
  raw_text: string | null;
  source_published_at: string | null;
  first_seen_at: string;
}

/**
 * Runs the pipeline under an atomic database lock (`acquire_pipeline_lock`): if another run owns a
 * live lease, returns `{ status: "skipped", skipped: "already_running" }` without creating a run
 * row, polling sources or calling Gemini. The lease is released in `finally`, and it also expires
 * on its own if the function instance is killed, so a crash can never block runs permanently.
 */
export async function runPipeline(deps: PipelineDeps, opts: RunOptions): Promise<RunSummary> {
  const startedMs = Date.now();
  const deadline = opts.deadline ?? startedMs + env().PIPELINE_TIME_BUDGET_SECONDS * 1000;
  const runId = randomUUID();

  const ttl = Math.ceil((deadline - startedMs) / 1000) + LOCK_GRACE_SECONDS;
  const acquired = unwrap(await db().rpc("acquire_pipeline_lock", { p_owner: runId, p_ttl_seconds: ttl }), "acquire pipeline lock");
  if (!acquired) return { ...emptySummary(), status: "skipped", skipped: "already_running" };

  try {
    return await executePipeline(deps, opts, runId, deadline);
  } finally {
    const released = await db().rpc("release_pipeline_lock", { p_owner: runId });
    if (released.error) console.error("failed to release pipeline lock (it will expire on its own)", released.error.message);
  }
}

function emptySummary(): RunSummary {
  return {
    runId: null, status: "completed", sourcesPolled: 0, articlesFound: 0, articlesNew: 0, articlesProcessed: 0,
    fundingEvents: 0, qualified: 0, drafts: 0, errors: [], trace: [],
  };
}

async function executePipeline(deps: PipelineDeps, opts: RunOptions, runId: string, deadline: number): Promise<RunSummary> {
  const now = deps.now ?? (() => new Date());
  const summary = emptySummary();

  const run = unwrap(await db().from("pipeline_runs").insert({ id: runId, trigger: opts.trigger }).select("id").single<{ id: string }>(), "create run");
  summary.runId = run.id;
  const log = new PipelineLogger(run.id);
  replayMaxAge = opts.replayMaxAgeHours;
  const recordError = async (scope: string, err: unknown, entity?: { type: string; id: string | null }) => {
    const message = errorMessage(err);
    summary.errors.push({ scope, message });
    await log.event(entity?.type ?? "pipeline", entity?.id ?? null, "error", `${scope}: ${message}`);
  };

  const progress = new ProgressTracker(async (snapshot) => {
    const r = await db().from("pipeline_runs").update({ progress_json: snapshot }).eq("id", run.id);
    if (r.error) throw new Error(r.error.message);
  });
  const ctx: Ctx = {
    deps, log, now, summary, deadline, progress,
    draftProvider: deps.draftProvider ?? selectDraftProvider(),
    dedupe: new SupabaseDedupeRepository(),
    outreachLookup: new SupabaseOutreachLookup(),
    recordError,
  };

  try {
    await log.event("pipeline", run.id, "run_started", `Pipeline run started (${opts.trigger})`);

    progress.setActivity("Starting run");

    // Stage 0 — resume rounds that failed transiently in a previous run.
    if (!opts.sourceKeys) await resumeRounds(ctx);

    // Stage 1 — ingestion
    if (!opts.skipIngest) await ingestSources(ctx, opts);
    else progress.finish("sources", "skipped for this run");

    // Stage 2+ — per-article funnel
    await processPending(ctx, opts.maxArticles ?? env().PIPELINE_MAX_ARTICLES_PER_RUN, opts.sourceKeys);

    // Stage 3 — contact discovery backfill for qualified startups that have none yet (earlier runs / time-budget skips).
    if (!opts.skipIngest && !opts.sourceKeys) await backfillContacts(ctx);
    progress.finish("contacts");
    progress.finish("drafts");

    // Stage 4 — Telegram backstop: alerts that never went out, and 24-hour-window reminders that are due.
    await sendTelegramSweep(ctx);
  } catch (err) {
    await recordError("pipeline", err);
    summary.status = "failed";
  }

  if (summary.status !== "failed") summary.status = summary.errors.length ? "partial" : "completed";
  progress.finishAll(summary.status === "failed" ? "failed" : "completed");
  await progress.flush();
  await db()
    .from("pipeline_runs")
    .update({
      completed_at: new Date().toISOString(),
      status: summary.status,
      sources_polled: summary.sourcesPolled,
      articles_found: summary.articlesFound,
      articles_new: summary.articlesNew,
      articles_processed: summary.articlesProcessed,
      funding_events_found: summary.fundingEvents,
      qualified_startups: summary.qualified,
      drafts_generated: summary.drafts,
      errors_json: summary.errors,
    })
    .eq("id", run.id);
  await log.event("pipeline", run.id, "run_finished", `Run ${summary.status}`, { ...summary, trace: undefined });
  return summary;
}

interface Ctx {
  deps: PipelineDeps;
  log: PipelineLogger;
  now: () => Date;
  summary: RunSummary;
  deadline: number;
  draftProvider: DraftProvider;
  dedupe: SupabaseDedupeRepository;
  outreachLookup: SupabaseOutreachLookup;
  progress: ProgressTracker;
  recordError: (scope: string, err: unknown, entity?: { type: string; id: string | null }) => Promise<void>;
}

/* ───────────────────────────── Stage 1: ingestion ───────────────────────────── */

async function ingestSources(ctx: Ctx, opts: RunOptions) {
  const sources = unwrap(await db().from("sources").select("*").eq("enabled", true), "load sources") as SourceRow[];
  const adapterFor = ctx.deps.createAdapter ?? defaultCreateAdapter;

  const targets = sources.filter((s) => !opts.sourceKeys || opts.sourceKeys.includes(s.key));
  ctx.progress.start("sources", targets.length);
  ctx.progress.setActivity(`Polling ${targets.length} funding source(s)`);
  await mapLimit(targets, 4, async (source) => {
    const due = !source.last_polled_at || ctx.now().getTime() - new Date(source.last_polled_at).getTime() >= source.poll_interval_minutes * 60_000 * 0.9;
    if (!opts.force && !due) {
      await ctx.log.event("source", source.id, "source_skipped", `${source.key} polled recently; skipped`);
      ctx.progress.tick("sources");
      return;
    }
    ctx.summary.sourcesPolled++;
    ctx.progress.setActivity(`Polling ${source.key}`);
    try {
      const items = await adapterFor(source).fetchLatest();
      const rows = items.flatMap((a) => {
        try {
          return [{
            source_id: source.id,
            source_url: a.sourceUrl,
            canonical_url: canonicalizeUrl(a.sourceUrl),
            headline: a.headline,
            snippet: a.snippet,
            raw_text: a.contentText,
            source_published_at: a.publishedAt?.toISOString() ?? null,
          }];
        } catch {
          return [];
        }
      });
      // ON CONFLICT DO NOTHING keeps the original first_seen_at: ingestion is idempotent.
      const inserted = rows.length
        ? unwrap(
            await db().from("funding_articles").upsert(rows, { onConflict: "canonical_url", ignoreDuplicates: true }).select("id"),
            `ingest ${source.key}`,
          )
        : [];
      ctx.summary.articlesFound += rows.length;
      ctx.summary.articlesNew += inserted.length;
      await db()
        .from("sources")
        .update({ last_polled_at: ctx.now().toISOString(), last_success_at: ctx.now().toISOString(), last_items_found: rows.length, last_error: null })
        .eq("id", source.id);
      await ctx.log.event("source", source.id, "source_polled", `${source.key}: ${rows.length} items, ${inserted.length} new`);
      ctx.progress.tick("sources");
    } catch (err) {
      await db()
        .from("sources")
        .update({ last_polled_at: ctx.now().toISOString(), last_error: errorMessage(err), last_error_at: ctx.now().toISOString() })
        .eq("id", source.id);
      await ctx.recordError(`source:${source.key}`, err, { type: "source", id: source.id });
      ctx.progress.tick("sources");
    }
  });
  ctx.progress.finish("sources", `${ctx.summary.articlesFound} articles seen, ${ctx.summary.articlesNew} new, ${ctx.summary.errors.filter((e) => e.scope.startsWith("source:")).length} source error(s)`);
}

/* ───────────────────────────── Stage 2: per-article funnel ───────────────────────────── */

let replayMaxAge: number | undefined;

async function loadFilterConfig(): Promise<HardFilterConfig> {
  const { thesis } = await loadActiveScoringConfig();
  return {
    allowed_countries: thesis.allowed_countries,
    allowed_stages: thesis.allowed_stages,
    max_announcement_age_hours: replayMaxAge ?? thesis.max_announcement_age_hours,
  };
}

async function rejectArticle(ctx: Ctx, a: ArticleRow, reason: RejectionReason | string, extra?: Record<string, unknown>) {
  await db()
    .from("funding_articles")
    .update({ processing_status: "rejected", rejection_reason: reason, processed_at: ctx.now().toISOString(), ...(extra ?? {}) })
    .eq("id", a.id);
  await ctx.log.event("article", a.id, "article_rejected", `${a.headline} → ${reason}`, { reason });
}

async function processPending(ctx: Ctx, maxArticles: number, sourceKeys?: string[]) {
  const cfg = await loadFilterConfig();
  let query = db()
    .from("funding_articles")
    .select("id,source_id,source_url,canonical_url,headline,snippet,raw_text,source_published_at,first_seen_at")
    .eq("processing_status", "pending")
    .order("source_published_at", { ascending: false, nullsFirst: false })
    .limit(400);
  if (sourceKeys) {
    const ids = ((await db().from("sources").select("id").in("key", sourceKeys)).data ?? []).map((r) => r.id as string);
    query = query.in("source_id", ids);
  }
  const pending = unwrap(await query, "load pending articles") as ArticleRow[];

  // Cheap gates first (no AI): staleness, then keyword relevance.
  const survivors: ArticleRow[] = [];
  ctx.progress.start("prefilter", pending.length);
  ctx.progress.setActivity(`Screening ${pending.length} pending article(s) by age and keywords`);
  for (const a of pending) {
    const announcedAt = new Date(a.source_published_at ?? a.first_seen_at);
    const ageHours = (ctx.now().getTime() - announcedAt.getTime()) / 3_600_000;
    if (ageHours > cfg.max_announcement_age_hours) {
      await rejectArticle(ctx, a, "announcement_too_old");
      traceRow(ctx, a, { classification: "-", eligibility: "rejected: announcement_too_old" });
    } else if (!looksLikeFundingNews(a.headline, a.snippet)) {
      await rejectArticle(ctx, a, "not_funding_announcement", { classification_json: { stage: "prefilter", funding_keywords: false } });
      traceRow(ctx, a, { classification: "prefilter: no funding signal", eligibility: "rejected: not_funding_announcement" });
    } else {
      survivors.push(a);
    }
    ctx.progress.tick("prefilter");
  }
  const batch = survivors.slice(0, maxArticles);
  ctx.progress.finish("prefilter", `${pending.length - survivors.length} dropped, ${survivors.length} continue${survivors.length > batch.length ? ` (${survivors.length - batch.length} deferred by the per-run cap)` : ""}`);
  ctx.progress.start("classify", batch.length);

  await mapLimit(batch, env().PIPELINE_CONCURRENCY, async (a) => {
    if (Date.now() > ctx.deadline) return; // stays pending for the next run
    const flags = { classified: false };
    try {
      await processArticle(ctx, a, cfg, flags);
      ctx.summary.articlesProcessed++;
    } catch (err) {
      if (!flags.classified) ctx.progress.tick("classify");
      await bumpAttempts(a.id, errorMessage(err));
      await ctx.recordError(`article:${a.headline.slice(0, 60)}`, err, { type: "article", id: a.id });
      traceRow(ctx, a, { classification: "error", eligibility: `error: ${errorMessage(err).slice(0, 80)}` });
    }
  });
  const deferred = batch.length - ctx.summary.articlesProcessed;
  ctx.progress.finish("classify", deferred > 0 ? `${deferred} left pending for the next run (time budget or retry)` : undefined);
  ctx.progress.finish("filters");
  ctx.progress.finish("research");
  ctx.progress.finish("scoring");
}

/** Transient failures leave the article pending (retried next run) up to 3 attempts, then it is marked error. */
async function bumpAttempts(articleId: string, message: string) {
  const { data } = await db().from("funding_articles").select("attempts").eq("id", articleId).single<{ attempts: number }>();
  const attempts = (data?.attempts ?? 0) + 1;
  await db()
    .from("funding_articles")
    .update({ attempts, last_error: message, ...(attempts >= MAX_ROUND_ATTEMPTS ? { processing_status: "error" } : {}) })
    .eq("id", articleId);
}

const sourceNames = new Map<string, string>();
async function sourceName(id: string): Promise<string> {
  if (!sourceNames.size) {
    const rows = (await db().from("sources").select("id,key")).data ?? [];
    for (const r of rows) sourceNames.set(r.id as string, r.key as string);
  }
  return sourceNames.get(id) ?? id;
}

function traceRow(ctx: Ctx, a: ArticleRow, v: Partial<TraceRow> & Pick<TraceRow, "classification" | "eligibility">) {
  const row: TraceRow = {
    source: a.source_id, article: a.headline, url: a.source_url, publishedAt: a.source_published_at, firstSeenAt: a.first_seen_at,
    company: null, stage: null, fitScore: null, draft: "-", ...v,
  };
  ctx.summary.trace.push(row);
  void sourceName(a.source_id).then((n) => (row.source = n));
}

async function processArticle(ctx: Ctx, a: ArticleRow, cfg: HardFilterConfig, flags: { classified: boolean }) {
  // Full text (cheap HTTP) — fall back to snippet if the page can't be fetched.
  let text = a.raw_text;
  if (!text || text.length < 600) {
    try {
      const fetcher = ctx.deps.fetchArticleText ?? (async (u: string) => fetchPage(u, 8000));
      const page = await fetcher(a.source_url);
      text = page.text;
      await db().from("funding_articles").update({ raw_text: text }).eq("id", a.id);
    } catch (err) {
      await ctx.log.event("article", a.id, "article_fetch_failed", errorMessage(err));
    }
  }

  ctx.progress.setActivity(`Classifying: ${a.headline.slice(0, 80)}`);
  const c: Classification = await classifyArticle(ctx.deps.ai, {
    headline: a.headline, snippet: a.snippet, articleText: text, source: await sourceName(a.source_id), publishedAt: a.source_published_at,
  });
  flags.classified = true;
  ctx.progress.tick("classify");
  ctx.progress.add("filters");
  await db().from("funding_articles").update({ classification_json: c, classification_confidence: c.confidence }).eq("id", a.id);
  const brief = `${c.is_funding_announcement ? (c.is_roundup ? "roundup" : "funding") : "not funding"} (${c.confidence.toFixed(2)})`;

  if (!c.is_funding_announcement || c.is_roundup || !c.company_name || c.confidence < MIN_CONFIDENCE) {
    const note = c.is_roundup ? "multi-company roundup (not handled in V1)" : c.confidence < MIN_CONFIDENCE ? "low confidence" : undefined;
    await rejectArticle(ctx, a, "not_funding_announcement", note ? { last_error: note } : undefined);
    traceRow(ctx, a, { classification: brief, company: c.company_name, stage: c.funding_stage, eligibility: `rejected: not_funding_announcement${note ? ` (${note})` : ""}` });
    ctx.progress.tick("filters");
    return;
  }

  const announcedAt = new Date(a.source_published_at ?? a.first_seen_at);
  const pre = evaluateHardFilters(cfg, {
    isFundingAnnouncement: true, isIndianStartup: c.is_indian_startup, hqCountry: c.hq_country, stage: c.funding_stage, announcedAt, now: ctx.now(),
    deferUnknownGeography: true,
  });
  if (!pre.passed) {
    await rejectArticle(ctx, a, pre.reason!);
    traceRow(ctx, a, { classification: brief, company: c.company_name, stage: c.funding_stage, eligibility: `rejected: ${pre.reason}` });
    ctx.progress.tick("filters");
    return;
  }

  // Deduplication: one startup + one round, many reports.
  const resolved = await resolveStartupAndRound(ctx.dedupe, {
    company: { name: c.company_name, hqCountry: c.hq_country, hqCity: c.hq_city, description: c.one_line_description },
    round: { stage: c.funding_stage, amount: c.funding_amount, currency: c.funding_currency, announcementDate: announcedAt, publishedAt: a.source_published_at ? new Date(a.source_published_at) : null },
    article: { id: a.id, sourceId: a.source_id, firstSeenAt: new Date(a.first_seen_at) },
  });
  await linkInvestors(resolved.round.id, c);
  await db().from("funding_articles").update({ funding_round_id: resolved.round.id }).eq("id", a.id);

  if (!resolved.isNewRound) {
    await db().from("funding_articles").update({ processing_status: "duplicate", processed_at: ctx.now().toISOString() }).eq("id", a.id);
    await ctx.log.event("round", resolved.round.id, "duplicate_report_attached", `${a.headline} attached to existing round of ${resolved.startup.name}`, { article_id: a.id, match: resolved.startupMatch });
    traceRow(ctx, a, { classification: brief, company: resolved.startup.name, stage: c.funding_stage, eligibility: `duplicate of existing round (${resolved.startupMatch})` });
    ctx.progress.tick("filters");
    return;
  }

  ctx.summary.fundingEvents++;
  await db().from("funding_articles").update({ processing_status: "processed", processed_at: ctx.now().toISOString() }).eq("id", a.id);
  await ctx.log.event("round", resolved.round.id, "funding_event_created", `${resolved.startup.name} ${c.funding_stage}`, { startup_id: resolved.startup.id, article_id: a.id });

  ctx.progress.tick("filters");
  const outcome = await evaluateRound(ctx, resolved.round.id);
  traceRow(ctx, a, { classification: brief, company: resolved.startup.name, stage: c.funding_stage, eligibility: outcome.eligibility, fitScore: outcome.score, draft: outcome.draft });
}

async function linkInvestors(roundId: string, c: Classification) {
  for (const name of c.investors.map((n) => n.trim()).filter(Boolean).slice(0, 12)) {
    const found = await db().from("investors").select("id").ilike("name", name.replace(/[%_]/g, "\\$&")).maybeSingle<{ id: string }>();
    let id = found.data?.id;
    if (!id) {
      const ins = await db().from("investors").insert({ name }).select("id").single<{ id: string }>();
      if (ins.error) {
        const again = await db().from("investors").select("id").ilike("name", name.replace(/[%_]/g, "\\$&")).maybeSingle<{ id: string }>();
        id = again.data?.id;
      } else id = ins.data.id;
    }
    if (id) {
      await db()
        .from("funding_round_investors")
        .upsert({ funding_round_id: roundId, investor_id: id, is_lead: c.lead_investor?.toLowerCase() === name.toLowerCase() }, { onConflict: "funding_round_id,investor_id", ignoreDuplicates: true });
    }
  }
}

/* ───────────────── Stage 3–6: already-contacted → research → score → outreach ───────────────── */

interface RoundEval {
  eligibility: string;
  score: number | null;
  draft: string;
}

async function setRound(roundId: string, patch: Record<string, unknown>) {
  await db().from("funding_rounds").update(patch).eq("id", roundId);
}

async function evaluateRound(ctx: Ctx, roundId: string): Promise<RoundEval> {
  const round = unwrap(
    await db().from("funding_rounds").select("*, startups(*)").eq("id", roundId).single(),
    "load round",
  ) as {
    id: string; startup_id: string; stage: string; amount: number | null; currency: string | null; attempts: number;
    earliest_source_published_at: string | null; created_at: string; startups: { id: string; name: string; hq_country: string | null; website: string | null };
  };
  const startup = round.startups;

  try {
    // Hard filter: has this startup already been contacted?
    if (await hasPriorOutreach(ctx.outreachLookup, startup.id)) {
      await setRound(roundId, { status: "rejected", rejection_reason: "already_contacted" });
      await ctx.log.event("round", roundId, "round_rejected", `${startup.name} already contacted`, { reason: "already_contacted" });
      return { eligibility: "rejected: already_contacted", score: null, draft: "none (already contacted)" };
    }

    await setRound(roundId, { status: "enriching", attempts: round.attempts + 1, last_error: null });

    // Research (expensive — only for candidates that survived every hard filter).
    const articles = unwrap(
      await db().from("funding_round_sources").select("funding_articles(source_url, raw_text, headline, snippet)").eq("funding_round_id", roundId),
      "load round articles",
    ) as unknown as { funding_articles: { source_url: string; raw_text: string | null; headline: string; snippet: string | null } }[];
    const docs: { url: string; text: string; links: { href: string; text: string }[] }[] = [];
    for (const r of articles) {
      const fa = r.funding_articles;
      let links: { href: string; text: string }[] = [];
      try {
        const page = await (ctx.deps.fetchArticleText ?? (async (u: string) => fetchPage(u, 8000)))(fa.source_url);
        links = page.links;
      } catch {
        /* text already stored; links optional */
      }
      docs.push({ url: fa.source_url, text: fa.raw_text ?? `${fa.headline}\n${fa.snippet ?? ""}`, links });
    }
    const research = await ctx.progress.track("research", `Researching ${startup.name}`, async () => {
      const r = await researchStartup(
        ctx.deps.ai,
        { companyName: startup.name, hqCountry: startup.hq_country, articles: docs, website: startup.website },
        ctx.log,
        startup.id,
      );
      await persistEnrichment(startup.id, r, ctx.log);
      return r;
    });
    await ctx.log.event("startup", startup.id, "startup_enriched", `${startup.name} enriched`, { sources: research.sources.length, warnings: research.warnings });

    // Geography is re-verified against research (it may have been unknown in the article).
    const cfg = await loadFilterConfig();
    if (!passesGeography(cfg, { hqCountry: research.profile.hq_country ?? startup.hq_country, isIndianStartup: null })) {
      await setRound(roundId, { status: "rejected", rejection_reason: "wrong_geography" });
      await ctx.log.event("round", roundId, "round_rejected", `${startup.name}: HQ country not confirmed as allowed (${research.profile.hq_country ?? "unknown"})`, { reason: "wrong_geography" });
      return { eligibility: "rejected: wrong_geography (after research)", score: null, draft: "none" };
    }

    // Fit scoring against the ACTIVE thesis (loaded at this moment from Supabase).
    const investorRows = (await db().from("funding_round_investors").select("investors(name)").eq("funding_round_id", roundId)).data as unknown as { investors: { name: string } }[] | null;
    const investors = (investorRows ?? []).map((r) => r.investors.name);
    const announcedAt = new Date(round.earliest_source_published_at ?? round.created_at);
    const { assessment, warnings } = await ctx.progress.track("scoring", `Scoring ${startup.name} against the thesis`, () =>
      assessRound(ctx.deps.ai, {
        startupId: startup.id, roundId, profile: research.profile as StartupProfile, stage: round.stage,
        amount: round.amount == null ? null : Number(round.amount), currency: round.currency, investors, announcedAt, now: ctx.now(),
      }),
    );
    ctx.progress.setDetail("scoring", `last: ${startup.name} ${assessment.total_score}/100`);
    await setRound(roundId, { status: "scored" });
    await ctx.log.event("round", roundId, "fit_scored", `${startup.name}: ${assessment.total_score}/100 (${assessment.qualified ? "qualified" : "below threshold"})`, { assessment_id: assessment.id, warnings, thesis_version: assessment.thesis_version });

    if (!assessment.qualified) {
      await setRound(roundId, { status: "rejected", rejection_reason: "below_threshold" });
      return { eligibility: "rejected: below_threshold", score: assessment.total_score, draft: "none" };
    }
    ctx.summary.qualified++;
    await setRound(roundId, { status: "qualified" });

    // Founder-first contact discovery (free sources only) so the draft can be addressed. Never blocks the draft.
    await ctx.progress.track("contacts", `Finding contact details for ${startup.name}`, () => enrichContactsSafely(ctx, startup.id, startup.name));

    // Personalised outreach (Gemini Task 4) → draft provider. Never sends.
    const { thesis } = await loadActiveScoringConfig();
    const out = await ctx.progress.track("drafts", `Writing outreach draft for ${startup.name}`, () =>
      createOutreachDraft(ctx.deps.ai, ctx.outreachLookup, ctx.draftProvider, {
        startupId: startup.id, roundId, assessmentId: assessment.id, profile: research.profile as StartupProfile, stage: round.stage,
        amount: round.amount == null ? null : Number(round.amount), currency: round.currency, investors,
        positiveSignals: assessment.positive_signals, thesisText: thesis.natural_language_thesis,
      }),
    );
    if (!out.created) {
      await ctx.log.event("round", roundId, "outreach_blocked", `${startup.name}: ${out.reason}`);
      return { eligibility: "qualified", score: assessment.total_score, draft: `blocked: ${out.reason}` };
    }
    ctx.summary.drafts++;
    await setRound(roundId, { status: "drafted" });
    await ctx.log.event("round", roundId, "draft_created", `Draft ${out.status} via ${out.provider}`, { outreach_id: out.outreachId, provider_error: out.providerError });
    if (out.providerError) await ctx.recordError("draft_provider", out.providerError, { type: "outreach", id: out.outreachId });
    // Tell the scout (Telegram, if configured). A failure here must never fail the round or the run.
    const telegramProblem = await notifyDraftReadySafely(out.outreachId);
    if (telegramProblem) await ctx.log.event("outreach", out.outreachId, "telegram_failed", telegramProblem);
    return { eligibility: "qualified", score: assessment.total_score, draft: `${out.status} (${out.provider})` };
  } catch (err) {
    await setRound(roundId, { status: "error", last_error: errorMessage(err) });
    await ctx.recordError(`round:${startup.name}`, err, { type: "round", id: roundId });
    return { eligibility: `error: ${errorMessage(err).slice(0, 80)}`, score: null, draft: "none" };
  }
}

/** Best-effort: Telegram trouble is logged and never fails the run. */
async function sendTelegramSweep(ctx: Ctx): Promise<void> {
  try {
    const deps = telegramDeps();
    if (!deps.config) return;
    const r = await runTelegramSweep({ ...deps, now: ctx.now });
    if (r.found || r.reminders || r.failures.length) await ctx.log.event("pipeline", null, "telegram_sweep", `Telegram: ${r.found} new-startup alert(s), ${r.reminders} deadline reminder(s)`, { failures: r.failures });
  } catch (err) {
    await ctx.log.event("pipeline", null, "telegram_failed", `telegram sweep: ${errorMessage(err)}`);
  }
}

const CONTACT_MIN_SECONDS_LEFT = 60;

/** Contact discovery must never fail the pipeline: errors are logged/recorded, the draft is still created. */
async function enrichContactsSafely(ctx: Ctx, startupId: string, name: string): Promise<void> {
  if (ctx.deadline - Date.now() < CONTACT_MIN_SECONDS_LEFT * 1000) {
    await ctx.log.event("startup", startupId, "contacts_deferred", `${name}: not enough run time left; will be picked up by the next run`);
    return;
  }
  try {
    const outcome = await (ctx.deps.enrichContacts ?? ((id: string) => enrichOne(ctx.deps.ai, id, { log: ctx.log })))(startupId);
    if (outcome?.status === "failed") await ctx.recordError(`contacts:${name}`, outcome.warnings.join(" | ") || "contact discovery failed", { type: "startup", id: startupId });
  } catch (err) {
    await ctx.recordError(`contacts:${name}`, err, { type: "startup", id: startupId });
  }
}

/** Up to CONTACT_BACKFILL_PER_RUN qualified startups that never went through contact discovery, within the time budget. */
async function backfillContacts(ctx: Ctx): Promise<void> {
  const limit = env().CONTACT_BACKFILL_PER_RUN;
  if (!limit || ctx.deadline - Date.now() < CONTACT_MIN_SECONDS_LEFT * 1000) return;
  try {
    const ids = await pendingQualifiedStartups(limit);
    if (!ids.length) return;
    ctx.progress.add("contacts", ids.length);
    ctx.progress.setActivity(`Contact discovery backfill for ${ids.length} earlier qualified startup(s)`);
    const outcomes = ctx.deps.enrichContacts
      ? await Promise.all(ids.map(async (id) => { try { return await ctx.deps.enrichContacts!(id); } finally { ctx.progress.tick("contacts"); } }))
      : await enrichBatch(ctx.deps.ai, ids, { deadline: ctx.deadline - CONTACT_MIN_SECONDS_LEFT * 1000, log: ctx.log, onDone: () => ctx.progress.tick("contacts") });
    await ctx.log.event("pipeline", null, "contacts_backfill", `Contact discovery backfill: ${ids.length} startup(s)`, { statuses: outcomes.map((o) => o?.status) });
  } catch (err) {
    await ctx.recordError("contacts:backfill", err);
  }
}

/** Retry rounds left in 'discovered'/'error' by an earlier run (max attempts, still inside the recency window). */
async function resumeRounds(ctx: Ctx) {
  const { thesis } = await loadActiveScoringConfig();
  const cutoff = new Date(ctx.now().getTime() - thesis.max_announcement_age_hours * 3_600_000).toISOString();
  const rounds = (await db()
    .from("funding_rounds")
    .select("id")
    .in("status", ["discovered", "error"])
    .lt("attempts", MAX_ROUND_ATTEMPTS)
    .gte("earliest_source_published_at", cutoff)
    .limit(10)).data ?? [];
  for (const r of rounds) {
    if (Date.now() > ctx.deadline) return;
    await ctx.log.event("round", r.id as string, "round_resumed", "Retrying incomplete round");
    await evaluateRound(ctx, r.id as string);
  }
}
