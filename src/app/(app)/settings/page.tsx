import type { Metadata } from "next";
import { SetupNotice, DisclosureSection, StatusLabel } from "@/components/ui";
import { ThesisForm } from "@/components/thesis-form";
import { formatDateTime } from "@/lib/format";
import { configured, thesisData } from "@/lib/queries";
import type { ThesisInput } from "@/lib/thesis/schema";

export const metadata: Metadata = { title: "Investment thesis · Settings" };
export const dynamic = "force-dynamic";

export default async function ThesisSettingsPage() {
  if (!configured()) return <SetupNotice message="Supabase is not configured." />;
  const { theses, active, criteria } = await thesisData();
  if (!active) return <SetupNotice message="No active thesis found. Apply the seed migration (npm run db:migrate)." />;

  const initial: ThesisInput = {
    name: active.name,
    description: active.description,
    natural_language_thesis: active.natural_language_thesis,
    allowed_countries: active.allowed_countries,
    allowed_stages: active.allowed_stages,
    included_sectors: active.included_sectors,
    preferred_subsectors: active.preferred_subsectors,
    excluded_sectors: active.excluded_sectors,
    preferred_business_models: active.preferred_business_models,
    max_announcement_age_hours: active.max_announcement_age_hours,
    minimum_fit_score: active.minimum_fit_score,
    recency_bands: active.recency_bands,
    stage_points: active.stage_points,
    criteria: criteria.map((c) => ({ criterion_key: c.criterion_key, display_name: c.display_name, description: c.description, weight: c.weight, enabled: c.enabled, sort_order: c.sort_order })),
  };

  return (
    <>
      <p className="-mt-2 mb-2 text-meta text-ink-3">Changes apply to every future assessment, with no redeploy. Startups already scored keep the version they were scored under.</p>
      <ThesisForm initial={initial} version={active.version} />
      <div className="mt-6 pb-16">
        <DisclosureSection title="Version history" summary={`Current: v${active.version}`} quiet>
          <ul className="divide-y divide-line">
            {theses.map((t) => (
              <li key={t.id} className="flex flex-wrap items-center gap-x-6 gap-y-1 py-2.5 text-meta text-ink-2">
                <span className="w-10 font-medium text-ink">v{t.version}</span>
                <span className="w-36">{formatDateTime(t.created_at)}</span>
                <span className="flex-1">Minimum fit {t.minimum_fit_score} · {t.allowed_stages.join(", ")}</span>
                {t.active && <StatusLabel label={{ text: "Active", tone: "positive" }} />}
              </li>
            ))}
          </ul>
        </DisclosureSection>
      </div>
    </>
  );
}
