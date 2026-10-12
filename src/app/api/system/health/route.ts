import { NextResponse } from "next/server";
import { hasSupabaseEnv } from "@/lib/env";
import { healthSnapshot } from "@/lib/queries";

export const dynamic = "force-dynamic";

/** Feeds the always-on health indicator and the draft badge. Contains no secrets. */
export async function GET() {
  if (!hasSupabaseEnv()) return NextResponse.json({ snapshot: null });
  try {
    return NextResponse.json({ snapshot: await healthSnapshot() }, { headers: { "cache-control": "no-store" } });
  } catch (err) {
    return NextResponse.json({ snapshot: null, error: err instanceof Error ? err.message : "health unavailable" }, { status: 500 });
  }
}
