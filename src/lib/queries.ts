import { db, unwrap } from "@/lib/supabase/admin";
import { DROP_KINDS, RANGES, type DropKey, type RangeKey } from "@/lib/ranges";
import { hasSupabaseEnv } from "@/lib/env";
import { hoursDelay, median } from "@/lib/format";
import { computePipelineHealth, describeHealth, SCHEDULE, type RunLike } from "@/lib/pipeline/health";
import { sourceHealth, type SourceLevel } from "@/lib/pipeline/source-health";
import { byPriority, needsAttention, toOpportunity, type Opportunity, type OpportunityRow } from "@/lib/opportunity/model";

export const configured = () => hasSupabaseEnv();

const since24h = () => new Date(Date.now() - 24 * 3_600_000).toISOString();
const LIVE_OUTREACH = ["generated", "draft_created", "approved", "sent"];

async function count(table: string, apply: (q: any) => any): Promise<number> {
  const res = await apply(db().from(table).select("id", { count: "exact", head: true }));
  if (res.error) throw new Error(`${table} count: ${res.error.message}`);
  return res.count ?? 0;
}

// ───────────────────────────── health (shell, Today, System) ─────────────────────────────

export interface HealthSnapshot {
  asOf: string;
  level: "healthy" | "delayed" | "warning";
  text: string;
  reason: string;
  running: boolean;
  lastSuccessAt: string | null;
  /** When the next scheduled scan is expected (GitHub cadence after the last run), if known. */
  nextExpectedAt: string | null;
  lastScheduledRunAt: string | null;
  lastScheduledRunStatus: string | null;
  latestFailure: { at: string; trigger: string; message: string } | null;
  sources: { key: string; name: string; level: SourceLevel; lastSuccessAt: string | null; error: string | null }[];
  schedule: { vercel: string; github: string };
  draftsReady: number;
}

export async function healthSnapshot(): Promise<HealthSnapshot> {
  const [runsRes, sourcesRes, draftsReady] = await Promise.all([
    db().from("pipeline_runs").select("id,status,trigger,started_at,completed_at,errors_json").order("started_at", { ascending: false }).limit(50),
    db().from("sources").select("key,name,enabled,poll_interval_minutes,last_polled_at,last_success_at,last_error,last_error_at").order("name"),
    count("outreach", (q) => q.in("status", ["generated", "draft_created"])),
  ]);
  const runs = (runsRes.data ?? []) as RunLike[];
  const now = new Date();
  const health = computePipelineHealth(runs, now);
  const { text } = describeHealth(health);
  const lastRun = runs.find((r) => r.status !== "running") ?? runs[0] ?? null;
  const scheduled = runs.find((r) => r.trigger === "cron") ?? null;
  const lastAt = health.lastSuccess ? (health.lastSuccess.completed_at ?? health.lastSuccess.started_at) : null;
  const next = lastRun ? new Date(new Date(lastRun.started_at).getTime() + 120 * 60_000).toISOString() : null;
  return {
    asOf: now.toISOString(),
    level: health.level,
    text,
    reason: health.reason,
    running: health.running,
    lastSuccessAt: lastAt,
    nextExpectedAt: next,
    lastScheduledRunAt: scheduled?.started_at ?? null,
    lastScheduledRunStatus: scheduled?.status ?? null,
    latestFailure: health.latestFailure ? { at: health.latestFailure.run.started_at, trigger: health.latestFailure.run.trigger, message: health.latestFailure.message } : null,
    sources: ((sourcesRes.data ?? []) as any[]).map((s) => ({ key: s.key, name: s.name, level: sourceHealth(s, now), lastSuccessAt: s.last_success_at, error: s.last_error })),
    schedule: { vercel: SCHEDULE.vercel.label, github: SCHEDULE.github.label },
    draftsReady,
  };
}

// ───────────────────────────── opportunities ─────────────────────────────

/** Qualified startups as scout-facing view-models, one per startup, in priority order. */
export async function opportunitiesData(): Promise<Opportunity[]> {
  const assessments = unwrap(
    await db()
      .from("fit_assessments")
      .select(
        "id,total_score,positive_signals,assessed_at,startup_id,funding_round_id,startups(id,name,description,sector,subsector,business_model,hq_city,hq_country),funding_rounds(stage,amount,currency,announcement_date,earliest_source_published_at,funding_round_investors(is_lead,investors(name)),funding_round_sources(sources(name)))",
      )
      .eq("qualified", true)
      .order("assessed_at", { ascending: false })
      .limit(300),
    "opportunities",
  ) as any[];

  // A re-score under a newer thesis can qualify the same startup twice; keep the latest assessment.
  const latest = new Map<string, any>();
  for (const a of assessments) if (a.startups && !latest.has(a.startup_id)) latest.set(a.startup_id, a);
  const rows = [...latest.values()];
  const ids = rows.map((a) => a.startup_id as string);

  const outreach = ids.length
    ? (unwrap(await db().from("outreach").select("id,startup_id,status,subject,recipient_name,created_at").in("startup_id", ids).order("created_at", { ascending: false }), "outreach") as any[])
    : [];
  const outreachByStartup = new Map<string, any>();
  // Prefer the live draft (the database allows only one per startup); otherwise the most recent one.
  for (const o of outreach) {
    const cur = outreachByStartup.get(o.startup_id);
    if (!cur || (!LIVE_OUTREACH.includes(cur.status) && LIVE_OUTREACH.includes(o.status))) outreachByStartup.set(o.startup_id, o);
  }

  const now = new Date();
  const list = rows.map((a) =>
    toOpportunity(
      {
        assessment: { total_score: a.total_score, positive_signals: a.positive_signals, assessed_at: a.assessed_at },
        startup: a.startups,
        round: a.funding_rounds ?? null,
        outreach: outreachByStartup.get(a.startup_id) ?? null,
      } satisfies OpportunityRow,
      now,
    ),
  );
  return list.sort(byPriority);
}

/** One window of the scouting funnel: what came in, and where each thing dropped out. */
export interface FunnelCounts {
  scanned: number;
  /** Not older than the thesis's age window. */
  recent: number;
  /** Recent *and* actually a funding announcement. */
  funding: number;
  /** Passed stage, geography and de-duplication: a funding event we evaluated. */
  eligible: number;
  qualified: number;
  drafted: number;
  dropped: { notFunding: number; tooOld: number; outsideThesis: number; belowScore: number };
}

async function funnelCounts(from: string, to: string): Promise<FunnelCounts> {
  const seen = (q: any) => q.gte("first_seen_at", from).lt("first_seen_at", to);
  const rejected = (reasons: string[]) => count("funding_articles", (q) => seen(q).in("rejection_reason", reasons));
  const [scanned, tooOld, notFunding, outsideThesis, rounds, assessed, qualified, drafted] = await Promise.all([
    count("funding_articles", seen),
    rejected(["announcement_too_old"]),
    rejected(["not_funding_announcement"]),
    rejected(["wrong_stage", "wrong_geography"]),
    count("funding_rounds", (q) => q.gte("created_at", from).lt("created_at", to)),
    count("fit_assessments", (q) => q.gte("assessed_at", from).lt("assessed_at", to)),
    count("fit_assessments", (q) => q.gte("assessed_at", from).lt("assessed_at", to).eq("qualified", true)),
    count("outreach", (q) => q.gte("created_at", from).lt("created_at", to)),
  ]);
  // Each stage is a subset of the one before it, so the funnel never widens (duplicates and re-scores can otherwise inflate a later count).
  const recent = Math.max(0, scanned - tooOld);
  const funding = Math.max(0, recent - notFunding);
  const eligible = Math.min(funding, rounds);
  return {
    scanned, recent, funding, eligible,
    qualified: Math.min(eligible, qualified),
    drafted: Math.min(qualified, drafted),
    dropped: { notFunding, tooOld, outsideThesis, belowScore: Math.max(0, assessed - qualified) },
  };
}

/** The chosen window of the funnel, plus the window of the same length right before it for comparison. */
export async function funnelData(range: RangeKey = "24h") {
  const ms = RANGES.find((r) => r.key === range)!.hours * 3_600_000;
  const now = Date.now();
  const iso = (t: number) => new Date(t).toISOString();
  const [current, previous] = await Promise.all([
    funnelCounts(iso(now - ms), iso(now + 60_000)),
    funnelCounts(iso(now - 2 * ms), iso(now - ms)),
  ]);
  return { current, previous };
}

export async function todayData(range: RangeKey = "24h") {
  const [opportunities, health, newDiscoveries, funnel] = await Promise.all([
    opportunitiesData(),
    healthSnapshot(),
    count("funding_rounds", (q) => q.gte("created_at", since24h()).neq("status", "rejected")),
    funnelData(range),
  ]);
  const attention = opportunities.filter((o) => needsAttention(o));
  return { attention, total: opportunities.length, health, newDiscoveries, draftsReady: health.draftsReady, funnel };
}

/** The items behind one "dropped out" count on Today: same window, same rule as the number. */
export async function droppedData(key: DropKey, range: RangeKey) {
  const from = new Date(Date.now() - RANGES.find((r) => r.key === range)!.hours * 3_600_000).toISOString();
  const to = new Date(Date.now() + 60_000).toISOString();
  if (key === "belowScore") {
    // The count is assessments that missed the threshold, so the list is the same assessments, shown as rounds.
    const rows = unwrap(
      await db()
        .from("fit_assessments")
        .select("funding_round_id,total_score,startups(id,name,sector),funding_rounds(stage,amount,currency,earliest_source_published_at)")
        .gte("assessed_at", from).lt("assessed_at", to).eq("qualified", false)
        .order("assessed_at", { ascending: false }).limit(200),
      "below-score assessments",
    ) as any[];
    const seen = new Set<string>();
    const rounds = rows.filter((a) => a.startups && !seen.has(a.funding_round_id) && seen.add(a.funding_round_id)).map((a) => ({ id: a.funding_round_id, startups: a.startups, rejection_reason: "below_threshold", score: a.total_score, ...(a.funding_rounds ?? {}) }));
    return { rounds, articles: [] as any[] };
  }
  const articles = unwrap(
    await db()
      .from("funding_articles")
      .select("id,headline,source_url,source_published_at,first_seen_at,processing_status,rejection_reason,sources(name)")
      .gte("first_seen_at", from).lt("first_seen_at", to)
      .in("rejection_reason", [...DROP_KINDS[key].reasons])
      .order("first_seen_at", { ascending: false }).limit(300),
    "dropped articles",
  ) as any[];
  return { rounds: [] as any[], articles };
}

// ───────────────────────────── discoveries ─────────────────────────────

export async function discoveriesData() {
  const rounds = unwrap(
    await db()
      .from("funding_rounds")
      .select("id,stage,amount,currency,status,rejection_reason,earliest_source_published_at,created_at,startups(id,name,sector),funding_round_sources(source_published_at,first_seen_at,sources(name),funding_articles(headline,source_url))")
      .order("earliest_source_published_at", { ascending: false, nullsFirst: false })
      .limit(150),
    "discovery rounds",
  );
  const filtered = unwrap(
    await db()
      .from("funding_articles")
      .select("id,headline,source_url,source_published_at,first_seen_at,processing_status,rejection_reason,sources(name)")
      .in("processing_status", ["rejected", "error", "pending"])
      .order("first_seen_at", { ascending: false })
      .limit(60),
    "filtered articles",
  );
  return { rounds: rounds as any[], filtered: filtered as any[] };
}

// ───────────────────────────── startup detail ─────────────────────────────

export async function startupDetail(id: string) {
  const startup = unwrap(await db().from("startups").select("*").eq("id", id).maybeSingle(), "startup");
  if (!startup) return null;
  const [founders, rounds, assessments, outreach] = await Promise.all([
    db().from("founders").select("*").eq("startup_id", id),
    db().from("funding_rounds").select("*,funding_round_sources(source_published_at,first_seen_at,sources(name),funding_articles(headline,source_url,canonical_url)),funding_round_investors(is_lead,investors(name))").eq("startup_id", id).order("announcement_date", { ascending: false }),
    db().from("fit_assessments").select("*").eq("startup_id", id).order("assessed_at", { ascending: false }),
    db().from("outreach").select("*").eq("startup_id", id).order("created_at", { ascending: false }),
  ]);
  const contacts = await db().from("startup_contacts").select("*").eq("startup_id", id).order("kind").order("created_at");
  const entityIds = [id, ...((rounds.data ?? []) as { id: string }[]).map((r) => r.id)];
  const events = await db().from("pipeline_events").select("id,event_type,message,created_at,entity_type,metadata_json").in("entity_id", entityIds).order("created_at", { ascending: false }).limit(40);
  // Provenance of researched facts (investor pages, per-report amounts). Optional: absent where the table doesn't exist yet.
  const evidence = await db().from("research_evidence").select("id,field_key,value_json,evidence_type,confidence,conflict_json,source_url,observed_at,sources(name)").eq("startup_id", id).order("field_key").limit(80);
  return { startup, founders: founders.data ?? [], rounds: rounds.data ?? [], assessments: assessments.data ?? [], outreach: outreach.data ?? [], contacts: contacts.error ? [] : contacts.data ?? [], events: events.data ?? [], evidence: evidence.error ? [] : evidence.data ?? [] } as any;
}

// ───────────────────────────── drafts ─────────────────────────────

export async function draftsData() {
  return unwrap(
    await db().from("outreach").select("id,status,subject,recipient_name,recipient_email,created_at,sent_at,startups(id,name),funding_rounds(stage,amount,currency)").order("created_at", { ascending: false }).limit(200),
    "drafts",
  ) as any[];
}

export async function draftDetail(id: string) {
  const draft = unwrap(
    await db().from("outreach").select("*,startups(id,name,description),funding_rounds(stage,amount,currency,earliest_source_published_at),fit_assessments(total_score,positive_signals)").eq("id", id).maybeSingle(),
    "draft",
  ) as any;
  if (!draft) return null;
  const contact = await db().from("startup_contacts").select("kind,email,contact_url,verification_status,founder_name").eq("startup_id", draft.startup_id).eq("is_preferred", true).maybeSingle();
  return { draft, preferredContact: contact.error ? null : (contact.data as any) ?? null };
}

// ───────────────────────────── settings ─────────────────────────────

export async function sourcesData() {
  const windowStart = Date.now() - 14 * 86_400_000;
  // The source list, the 14-day report links and every per-source article count are independent, so fetch them together
  // (counting sources one after another made this page take seconds once the list grew past a handful).
  const [sourcesRes, linksRes] = await Promise.all([
    db().from("sources").select("*").order("name"),
    db().from("funding_round_sources").select("funding_round_id,source_id,source_published_at,first_seen_at").gte("source_published_at", new Date(windowStart).toISOString()).limit(5000),
  ]);
  const sources = unwrap(sourcesRes, "sources") as any[];
  const links = unwrap(linksRes, "round sources") as { funding_round_id: string; source_id: string; source_published_at: string | null; first_seen_at: string }[];
  const articleCounts = new Map<string, number>();
  await Promise.all(sources.map(async (s) => articleCounts.set(s.id, await count("funding_articles", (q) => q.eq("source_id", s.id)))));

  const byRound = new Map<string, typeof links>();
  for (const l of links) byRound.set(l.funding_round_id, [...(byRound.get(l.funding_round_id) ?? []), l]);

  const metrics = new Map<string, { reports: number; delays: number[]; wins: number; unique: number }>();
  for (const s of sources) metrics.set(s.id, { reports: 0, delays: [], wins: 0, unique: 0 });
  for (const [, reports] of byRound) {
    const timed = reports.filter((r) => r.source_published_at);
    const earliest = timed.length ? timed.reduce((a, b) => (new Date(a.source_published_at!) <= new Date(b.source_published_at!) ? a : b)) : null;
    const distinct = new Set(reports.map((r) => r.source_id));
    for (const r of reports) {
      const m = metrics.get(r.source_id)!;
      m.reports++;
      const d = hoursDelay(r.source_published_at, r.first_seen_at);
      if (d != null && d >= 0) m.delays.push(d);
      if (earliest && r.funding_round_id === earliest.funding_round_id && r.source_id === earliest.source_id) m.wins++;
    }
    if (distinct.size === 1) metrics.get([...distinct][0])!.unique++;
  }
  const now = new Date();
  const withHealth = sources.map((s) => ({ ...s, level: sourceHealth(s, now) as SourceLevel }));
  return { sources: withHealth, articleCounts, metrics, medianDelay: (id: string) => median(metrics.get(id)?.delays ?? []) };
}

export async function thesisData() {
  const theses = unwrap(await db().from("accelerator_theses").select("*").order("version", { ascending: false }), "theses") as any[];
  const active = theses.find((t) => t.active) ?? null;
  const criteria = active ? unwrap(await db().from("scoring_criteria").select("*").eq("thesis_id", active.id).order("sort_order"), "criteria") as any[] : [];
  return { theses, active, criteria };
}

// ───────────────────────────── system (Settings → System, landing) ─────────────────────────────

export async function systemData() {
  const s = since24h();
  const [articles, events, qualified, rejected, drafts, runs, recentEvents, delays, health] = await Promise.all([
    count("funding_articles", (q) => q.gte("first_seen_at", s)),
    count("funding_rounds", (q) => q.gte("created_at", s)),
    count("fit_assessments", (q) => q.gte("assessed_at", s).eq("qualified", true)),
    count("funding_rounds", (q) => q.gte("created_at", s).eq("status", "rejected")),
    count("outreach", (q) => q.gte("created_at", s)),
    db().from("pipeline_runs").select("*").order("started_at", { ascending: false }).limit(8),
    db().from("pipeline_events").select("id,event_type,message,created_at,entity_type").order("created_at", { ascending: false }).limit(30),
    // Only articles *published* in the window: older articles that get first seen late (backfill) would swamp the median.
    db().from("funding_articles").select("source_published_at,first_seen_at").gte("source_published_at", s).not("source_published_at", "is", null).limit(2000),
    healthSnapshot(),
  ]);
  const ds = ((delays.data ?? []) as { source_published_at: string; first_seen_at: string }[])
    .map((r) => hoursDelay(r.source_published_at, r.first_seen_at))
    .filter((d): d is number => d != null && d >= 0);
  return { articles, events, qualified, rejected, drafts, medianDelay: median(ds), health, runs: runs.data ?? [], recentEvents: recentEvents.data ?? [] };
}

/** Lightweight counts for the public landing page. */
export async function landingStats() {
  const s = since24h();
  const [articles, events, qualified, drafts, health] = await Promise.all([
    count("funding_articles", (q) => q.gte("first_seen_at", s)),
    count("funding_rounds", (q) => q.gte("created_at", s)),
    count("fit_assessments", (q) => q.gte("assessed_at", s).eq("qualified", true)),
    count("outreach", (q) => q.gte("created_at", s)),
    healthSnapshot(),
  ]);
  return { articles, events, qualified, drafts, healthText: health.text, lastRunAt: health.lastScheduledRunAt ?? health.lastSuccessAt };
}
