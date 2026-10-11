import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { timingSafeEqual } from "@/lib/auth";
import { getAI } from "@/lib/ai";
import { runPipeline } from "@/lib/pipeline/run";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** Scheduled entry point (Vercel Cron / GitHub Actions). Protected by `Authorization: Bearer $CRON_SECRET`. */
export async function GET(request: Request) {
  const secret = env().CRON_SECRET;
  const given = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!secret || !timingSafeEqual(given, secret)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const summary = await runPipeline({ ai: getAI() }, { trigger: "cron", deadline: Date.now() + (maxDuration - 45) * 1000 });
  const { trace: _trace, ...rest } = summary;
  void _trace;
  return NextResponse.json(rest, { status: summary.status === "failed" ? 500 : 200 });
}
