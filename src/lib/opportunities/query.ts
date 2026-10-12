import { db, unwrap } from "@/lib/supabase/admin";
import { sourceShortName } from "@/lib/labels";
import { buildOpportunity, sortOpportunities, type Opportunity, type RawOpportunityRow } from "./derive";

const LIVE_STATUSES = ["generated", "draft_created", "approved", "sent"];

/** A startup can have several outreach rows over time (rejected ones stay). Prefer the live one, else the newest. */
function pickOutreach(rows: { id: string; startup_id: string; status: string; recipient_email: string | null; created_at: string }[]) {
  const byStartup = new Map<string, (typeof rows)[number]>();
  for (const r of rows) {
    const cur = byStartup.get(r.startup_id);
    const better = !cur || (LIVE_STATUSES.includes(r.status) && !LIVE_STATUSES.includes(cur.status)) || (LIVE_STATUSES.includes(r.status) === LIVE_STATUSES.includes(cur.status) && r.created_at > cur.created_at);
    if (better) byStartup.set(r.startup_id, r);
  }
  return byStartup;
}

export interface OpportunitiesResult {
  items: Opportunity[];
  maxAgeHours: number;
  minFit: number;
}

/** Every qualified startup (latest assessment each), joined with its round, investors, publications and draft state. */
export async function opportunitiesData(now = new Date()): Promise<OpportunitiesResult> {
  const thesis = unwrap(await db().from("accelerator_theses").select("max_announcement_age_hours,minimum_fit_score").eq("active", true).maybeSingle(), "active thesis") as { max_announcement_age_hours: number; minimum_fit_score: number } | null;

  const maxAgeHours = thesis?.max_announcement_age_hours ?? 24;

  const assessments = unwrap(
    await db()
      .from("fit_assessments")
      .select(
        "startup_id,total_score,positive_signals,concerns,reasoning,assessed_at,thesis_version," +
          "startups(name,description,sector,subsector,hq_city,hq_country,website,domain,business_model,enrichment_status,product:profile_json->>product)," +
          "funding_rounds(id,stage,amount,currency,earliest_source_published_at,announcement_date,created_at,funding_round_investors(is_lead,investors(name)),funding_round_sources(sources(name)))",
      )
      .eq("qualified", true)
      .order("assessed_at", { ascending: false })
      .limit(300),
    "opportunities",
  ) as any[];

  const latest = new Map<string, any>();
  for (const a of assessments) if (!latest.has(a.startup_id)) latest.set(a.startup_id, a);

  const ids = [...latest.keys()];
  const outreach = ids.length ? (unwrap(await db().from("outreach").select("id,startup_id,status,recipient_email,created_at").in("startup_id", ids), "outreach") as any[]) : [];
  const outreachBy = pickOutreach(outreach);

  const items = [...latest.values()].map((a): Opportunity => {
    const round = a.funding_rounds ?? {};
    const startup = a.startups ?? {};
    const o = outreachBy.get(a.startup_id);
    const raw: RawOpportunityRow = {
      startupId: a.startup_id,
      assessment: a,
      startup: { ...startup, profile_json: startup.product ? { product: startup.product } : null },
      round: {
        ...round,
        investors: (round.funding_round_investors ?? []).filter((i: any) => i.investors?.name).map((i: any) => ({ name: i.investors.name as string, lead: !!i.is_lead })),
        sources: [...new Set<string>((round.funding_round_sources ?? []).map((s: any) => sourceShortName(s.sources?.name)).filter(Boolean))],
      },
      outreach: o ? { id: o.id, status: o.status, recipient_email: o.recipient_email } : null,
    };
    return buildOpportunity(raw, now, maxAgeHours);
  });

  return { items: sortOpportunities(items), maxAgeHours, minFit: thesis?.minimum_fit_score ?? 70 };
}

/** The active thesis’ announcement window and qualification threshold (for “time left” and score context). */
export async function activeThesisWindow(): Promise<{ maxAgeHours: number; minFit: number; version: number | null }> {
  const t = unwrap(await db().from("accelerator_theses").select("max_announcement_age_hours,minimum_fit_score,version").eq("active", true).maybeSingle(), "active thesis") as { max_announcement_age_hours: number; minimum_fit_score: number; version: number } | null;
  return { maxAgeHours: t?.max_announcement_age_hours ?? 24, minFit: t?.minimum_fit_score ?? 70, version: t?.version ?? null };
}
