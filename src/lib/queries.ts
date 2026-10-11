import { db, unwrap } from "@/lib/supabase/admin";
import { hasSupabaseEnv } from "@/lib/env";
import { hoursDelay } from "@/lib/format";
import { computePipelineHealth, type RunLike } from "@/lib/pipeline/health";

export const configured = () => hasSupabaseEnv();

const since24h = () => new Date(Date.now() - 24 * 3_600_000).toISOString();

async function count(table: string, apply: (q: any) => any): Promise<number> {
  const res = await apply(db().from(table).select("id", { count: "exact", head: true }));
  if (res.error) throw new Error(`${table} count: ${res.error.message}`);
  return res.count ?? 0;
}

export async function dashboardData() {
  const s = since24h();
  const [articles, events, qualified, rejected, drafts, lastRun, recentEvents, delays, healthRuns] = await Promise.all([
    count("funding_articles", (q) => q.gte("first_seen_at", s)),
    count("funding_rounds", (q) => q.gte("created_at", s)),
    count("fit_assessments", (q) => q.gte("assessed_at", s).eq("qualified", true)),
    count("funding_rounds", (q) => q.gte("created_at", s).eq("status", "rejected")),
    count("outreach", (q) => q.gte("created_at", s)),
    db().from("pipeline_runs").select("*").order("started_at", { ascending: false }).limit(5),
    db().from("pipeline_events").select("id,event_type,message,created_at,entity_type").order("created_at", { ascending: false }).limit(12),
    db().from("funding_articles").select("source_published_at,first_seen_at").gte("first_seen_at", s).not("source_published_at", "is", null).limit(2000),
    db().from("pipeline_runs").select("id,status,trigger,started_at,completed_at,errors_json").order("started_at", { ascending: false }).limit(50),
  ]);
  const ds = ((delays.data ?? []) as { source_published_at: string; first_seen_at: string }[])
    .map((r) => hoursDelay(r.source_published_at, r.first_seen_at))
    .filter((d): d is number => d != null && d >= 0);
  const avgDelay = ds.length ? ds.reduce((a, b) => a + b, 0) / ds.length : null;
  const health = computePipelineHealth((healthRuns.data ?? []) as RunLike[]);
  return { articles, events, qualified, rejected, drafts, avgDelay, health, runs: lastRun.data ?? [], recentEvents: recentEvents.data ?? [] };
}

export async function feedData() {
  const rounds = unwrap(
    await db()
      .from("funding_rounds")
      .select("id,stage,amount,currency,status,rejection_reason,earliest_source_published_at,created_at,startups(id,name,sector),funding_round_sources(source_published_at,first_seen_at,sources(name),funding_articles(headline,source_url))")
      .order("earliest_source_published_at", { ascending: false, nullsFirst: false })
      .limit(150),
    "feed rounds",
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

export async function qualifiedData() {
  const assessments = unwrap(
    await db()
      .from("fit_assessments")
      .select("id,total_score,qualified,positive_signals,assessed_at,thesis_version,startup_id,funding_round_id,startups(id,name,sector,subsector,enrichment_status),funding_rounds(stage,amount,currency,earliest_source_published_at)")
      .eq("qualified", true)
      .order("assessed_at", { ascending: false })
      .limit(100),
    "qualified",
  ) as any[];
  const ids = assessments.map((a) => a.startup_id);
  const outreach = ids.length ? unwrap(await db().from("outreach").select("startup_id,status").in("startup_id", ids), "outreach status") as { startup_id: string; status: string }[] : [];
  return { assessments, outreachByStartup: new Map(outreach.map((o) => [o.startup_id, o.status])) };
}

export async function startupDetail(id: string) {
  const startup = unwrap(await db().from("startups").select("*").eq("id", id).maybeSingle(), "startup");
  if (!startup) return null;
  const [founders, rounds, assessments, outreach] = await Promise.all([
    db().from("founders").select("*").eq("startup_id", id),
    db().from("funding_rounds").select("*,funding_round_sources(source_published_at,first_seen_at,sources(name),funding_articles(headline,source_url)),funding_round_investors(is_lead,investors(name))").eq("startup_id", id).order("announcement_date", { ascending: false }),
    db().from("fit_assessments").select("*").eq("startup_id", id).order("assessed_at", { ascending: false }),
    db().from("outreach").select("*").eq("startup_id", id).order("created_at", { ascending: false }),
  ]);
  return { startup, founders: founders.data ?? [], rounds: rounds.data ?? [], assessments: assessments.data ?? [], outreach: outreach.data ?? [] } as any;
}

export async function draftsData() {
  return unwrap(
    await db().from("outreach").select("*,startups(id,name),funding_rounds(stage,amount,currency),fit_assessments(total_score)").order("created_at", { ascending: false }).limit(100),
    "drafts",
  ) as any[];
}

export async function sourcesData() {
  const sources = unwrap(await db().from("sources").select("*").order("name"), "sources") as any[];
  const links = unwrap(
    await db().from("funding_round_sources").select("funding_round_id,source_id,source_published_at,first_seen_at").limit(5000),
    "round sources",
  ) as { funding_round_id: string; source_id: string; source_published_at: string | null; first_seen_at: string }[];
  const articleCounts = new Map<string, number>();
  for (const s of sources) articleCounts.set(s.id, await count("funding_articles", (q) => q.eq("source_id", s.id)));

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
  return { sources, articleCounts, metrics };
}

export async function thesisData() {
  const theses = unwrap(await db().from("accelerator_theses").select("*").order("version", { ascending: false }), "theses") as any[];
  const active = theses.find((t) => t.active) ?? null;
  const criteria = active ? unwrap(await db().from("scoring_criteria").select("*").eq("thesis_id", active.id).order("sort_order"), "criteria") as any[] : [];
  return { theses, active, criteria };
}
