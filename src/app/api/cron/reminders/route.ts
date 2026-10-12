import { NextResponse } from "next/server";
import { env, hasSupabaseEnv } from "@/lib/env";
import { timingSafeEqual } from "@/lib/auth";
import { runTelegramSweep, telegramDeps } from "@/lib/telegram/notify";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Deadline reminders. A lightweight check (no scraping, no AI) meant to run every ~10 minutes from GitHub Actions
 * (`.github/workflows/telegram-reminders.yml`): Vercel Hobby cron only runs once a day, far too coarse for
 * "2 hours before the window closes". Protected like the pipeline endpoint: `Authorization: Bearer $CRON_SECRET`.
 */
export async function GET(request: Request) {
  const secret = env().CRON_SECRET;
  const given = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!secret || !timingSafeEqual(given, secret)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!hasSupabaseEnv()) return NextResponse.json({ error: "supabase not configured" }, { status: 503 });

  const deps = telegramDeps();
  if (!deps.config) return NextResponse.json({ status: "skipped", reason: "telegram_not_configured" });
  try {
    const r = await runTelegramSweep(deps);
    return NextResponse.json({ status: r.failures.length ? "partial" : "ok", found: r.found, reminders: r.reminders, failures: r.failures }, { status: r.failures.length ? 502 : 200 });
  } catch (err) {
    return NextResponse.json({ status: "failed", error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
