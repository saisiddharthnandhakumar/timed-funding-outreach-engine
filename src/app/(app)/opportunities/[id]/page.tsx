import { notFound } from "next/navigation";
import { isUuid } from "@/lib/util/text";
import { startupDetail, configured } from "@/lib/queries";
import { StartupView } from "@/components/startup/startup-view";
import { SetupNotice } from "@/components/ui";

export const dynamic = "force-dynamic";
export const maxDuration = 120; // the "re-run contact search" server action crawls a site and calls Gemini

export default async function StartupPage({ params }: { params: Promise<{ id: string }> }) {
  if (!configured()) return <SetupNotice message="Supabase is not configured." />;
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const d = await startupDetail(id);
  if (!d) notFound();
  return <StartupView d={d} />;
}
