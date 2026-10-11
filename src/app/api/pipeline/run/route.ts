import { after, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { ADMIN_COOKIE, isValidSession } from "@/lib/auth";
import { getAI } from "@/lib/ai";
import { runPipeline } from "@/lib/pipeline/run";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** Manual "Run pipeline now" (admin only). Responds immediately; the run continues in the background. */
export async function POST() {
  if (!(await isValidSession((await cookies()).get(ADMIN_COOKIE)?.value))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const deadline = Date.now() + (maxDuration - 45) * 1000;
  after(async () => {
    try {
      await runPipeline({ ai: getAI() }, { trigger: "manual", force: true, deadline });
    } catch (err) {
      console.error("manual pipeline run failed", err);
    }
  });
  return NextResponse.json({ started: true }, { status: 202 });
}
