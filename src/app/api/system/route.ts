import { NextResponse } from "next/server";
import { systemSummary } from "@/lib/system";

export const dynamic = "force-dynamic";

/** Read-only system summary for the app shell (status chip, sidebar badges). Same data the pages show. */
export async function GET() {
  return NextResponse.json(await systemSummary(), { headers: { "cache-control": "no-store" } });
}
