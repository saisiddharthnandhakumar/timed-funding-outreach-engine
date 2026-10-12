import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { OpportunityDetailView, type OpportunityDetailData } from "@/components/opportunity-detail";
import { SetupNotice } from "@/components/ui";
import { activeThesisWindow } from "@/lib/opportunities/query";
import { configured, startupDetail } from "@/lib/queries";

export const dynamic = "force-dynamic";
export const maxDuration = 120; // the “search again for a contact” server action crawls a site and calls Gemini

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  if (!configured()) return { title: "Startup" };
  const { id } = await params;
  try {
    const d = await startupDetail(id);
    return { title: d?.startup?.name ?? "Startup" };
  } catch {
    return { title: "Startup" };
  }
}

export default async function OpportunityPage({ params }: { params: Promise<{ id: string }> }) {
  if (!configured()) return <SetupNotice message="Supabase is not configured." />;
  const { id } = await params;
  const [d, thesis] = await Promise.all([startupDetail(id), activeThesisWindow()]);
  if (!d) notFound();
  return <OpportunityDetailView d={d as OpportunityDetailData} thesis={thesis} now={new Date()} />;
}
