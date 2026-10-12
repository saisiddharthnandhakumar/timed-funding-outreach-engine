import { NextResponse } from "next/server";
import { db } from "@/lib/supabase/admin";
import { hasSupabaseEnv } from "@/lib/env";

export const dynamic = "force-dynamic";

export interface SearchResult {
  kind: "startup" | "founder";
  id: string;
  title: string;
  subtitle: string;
  href: string;
  qualified?: boolean;
}

/** PostgREST `or=` filters are comma/paren delimited: strip anything that could change their structure. */
const clean = (q: string) => q.replace(/[%,()*\\:"']/g, " ").replace(/\s+/g, " ").trim().slice(0, 60);

/** ⌘K search across company names, sectors and founders. Read-only; same data the pages already show. */
export async function GET(request: Request) {
  const q = clean(new URL(request.url).searchParams.get("q") ?? "");
  if (q.length < 2 || !hasSupabaseEnv()) return NextResponse.json({ results: [] });

  const [startups, founders] = await Promise.all([
    db().from("startups").select("id,name,sector,subsector,hq_city").or(`name.ilike.%${q}%,sector.ilike.%${q}%,subsector.ilike.%${q}%`).order("name").limit(6),
    db().from("founders").select("id,name,role,startup_id,startups(id,name)").ilike("name", `%${q}%`).limit(5),
  ]);
  if (startups.error || founders.error) return NextResponse.json({ results: [] }, { status: 500 });

  const ids = [...new Set([...(startups.data ?? []).map((s) => s.id as string), ...(founders.data ?? []).map((f) => f.startup_id as string)])];
  const qualifiedIds = new Set<string>();
  if (ids.length) {
    const a = await db().from("fit_assessments").select("startup_id").eq("qualified", true).in("startup_id", ids);
    for (const r of a.data ?? []) qualifiedIds.add(r.startup_id as string);
  }

  const results: SearchResult[] = [
    ...(startups.data ?? []).map((s): SearchResult => ({
      kind: "startup",
      id: s.id as string,
      title: s.name as string,
      subtitle: [s.subsector ?? s.sector, s.hq_city].filter(Boolean).join(" · "),
      href: `/opportunities/${s.id}`,
      qualified: qualifiedIds.has(s.id as string),
    })),
    ...(founders.data ?? []).map((f: any): SearchResult => ({
      kind: "founder",
      id: f.id as string,
      title: f.name as string,
      subtitle: [f.role, f.startups?.name].filter(Boolean).join(" · "),
      href: `/opportunities/${f.startup_id}`,
      qualified: qualifiedIds.has(f.startup_id as string),
    })),
  ];
  return NextResponse.json({ results }, { headers: { "cache-control": "no-store" } });
}
