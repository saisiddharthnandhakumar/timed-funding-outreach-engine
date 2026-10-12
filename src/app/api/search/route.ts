import { NextResponse, type NextRequest } from "next/server";
import { hasSupabaseEnv } from "@/lib/env";
import { db } from "@/lib/supabase/admin";
import { formatAmount, stageLabel } from "@/lib/format";
import type { SearchHit } from "@/lib/search";

export const dynamic = "force-dynamic";

/** Strips characters that have meaning in a LIKE pattern or PostgREST filter, so user text is only ever data. */
const clean = (q: string) => q.replace(/[%_\\,()*]/g, " ").replace(/\s+/g, " ").trim().slice(0, 60);

/** ⌘K: startups by name, sector or subsector, and by founder name. */
export async function GET(request: NextRequest) {
  const q = clean(request.nextUrl.searchParams.get("q") ?? "");
  if (q.length < 2 || !hasSupabaseEnv()) return NextResponse.json({ hits: [] });
  const pattern = `%${q}%`;
  const [byName, bySector, bySub, byFounder] = await Promise.all([
    db().from("startups").select("id,name,sector,hq_city,funding_rounds(stage,amount,currency)").ilike("name", pattern).limit(6),
    db().from("startups").select("id,name,sector,hq_city,funding_rounds(stage,amount,currency)").ilike("sector", pattern).limit(6),
    db().from("startups").select("id,name,sector,hq_city,funding_rounds(stage,amount,currency)").ilike("subsector", pattern).limit(6),
    db().from("founders").select("name,role,startups(id,name,sector,hq_city,funding_rounds(stage,amount,currency))").ilike("name", pattern).limit(6),
  ]);

  const hits = new Map<string, SearchHit>();
  const describe = (s: any, extra?: string) => {
    const r = s.funding_rounds?.[0];
    return [extra, r ? `${stageLabel(r.stage)} · ${formatAmount(r.amount, r.currency)}` : null, s.sector, s.hq_city].filter(Boolean).join(" · ");
  };
  const add = (s: any, match: SearchHit["match"], extra?: string) => {
    if (s?.id && !hits.has(s.id)) hits.set(s.id, { id: s.id, name: s.name, detail: describe(s, extra), match });
  };
  for (const s of (byName.data ?? []) as any[]) add(s, "startup");
  for (const f of (byFounder.data ?? []) as any[]) add(f.startups, "founder", `Founder: ${f.name}`);
  for (const s of [...((bySector.data ?? []) as any[]), ...((bySub.data ?? []) as any[])]) add(s, "sector");
  return NextResponse.json({ hits: [...hits.values()].slice(0, 8) });
}
