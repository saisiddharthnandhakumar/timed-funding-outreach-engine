import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DraftPageView } from "@/components/draft-page";
import { SetupNotice } from "@/components/ui";
import { env } from "@/lib/env";
import { configured, draftDetail } from "@/lib/queries";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  if (!configured()) return { title: "Draft" };
  try {
    const d = await draftDetail((await params).id);
    return { title: d ? `Draft · ${d.startups?.name ?? ""}` : "Draft" };
  } catch {
    return { title: "Draft" };
  }
}

export default async function DraftPage({ params }: { params: Promise<{ id: string }> }) {
  if (!configured()) return <SetupNotice message="Supabase is not configured." />;
  const { id } = await params;
  const d = await draftDetail(id);
  if (!d) notFound();
  const e = env();
  return <DraftPageView d={d} sendConfig={{ apiKey: e.RESEND_API_KEY, fromEmail: e.RESEND_FROM_EMAIL, fromName: e.RESEND_FROM_NAME ?? e.OUTREACH_SENDER_NAME, replyTo: e.RESEND_REPLY_TO }} />;
}
