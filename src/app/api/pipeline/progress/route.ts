import { NextResponse } from "next/server";
import { db } from "@/lib/supabase/admin";
import { hasSupabaseEnv } from "@/lib/env";

export const dynamic = "force-dynamic";

/** Latest pipeline run with its live per-stage progress (polled by the dashboard). */
export async function GET() {
  if (!hasSupabaseEnv()) return NextResponse.json({ run: null });
  let res = await db()
    .from("pipeline_runs")
    .select("id,status,trigger,started_at,completed_at,errors_json,progress_json")
    .order("started_at", { ascending: false })
    .limit(1);
  if (res.error) {
    // progress_json not migrated yet: still report the run itself
    res = (await db().from("pipeline_runs").select("id,status,trigger,started_at,completed_at,errors_json").order("started_at", { ascending: false }).limit(1)) as typeof res;
  }
  if (res.error) return NextResponse.json({ error: res.error.message }, { status: 500 });
  return NextResponse.json({ run: res.data?.[0] ?? null }, { headers: { "cache-control": "no-store" } });
}
