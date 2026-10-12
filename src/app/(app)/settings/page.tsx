import { thesisData, configured } from "@/lib/queries";
import { SetupNotice } from "@/components/ui";
import { DisclosureSection } from "@/components/disclosure-section";
import { ThesisForm } from "@/components/thesis-form";
import { formatDateTime } from "@/lib/format";
import { STAGE_LABELS, type FundingStage } from "@/types/domain";
import type { ThesisInput } from "@/lib/thesis/schema";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
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
      <p className="mb-8 max-w-2xl text-[0.95rem] leading-relaxed text-muted">
        What your accelerator looks for. Every scan scores new funding news against this. Each save creates a new version, so past scores always keep the thesis they were scored under.
        <span className="ml-1 text-faint">Active: version {active.version}.</span>
      </p>
      <ThesisForm key="thesis-form" initial={initial} version={active.version} />

      <div className="mt-12">
        <DisclosureSection title="View version history" hint={`${theses.length} ${theses.length === 1 ? "version" : "versions"}`}>
          <ul className="divide-y divide-line text-sm">
            {theses.map((t) => (
              <li key={t.id} className="flex flex-wrap items-baseline gap-x-5 gap-y-1 py-2.5">
                <span className="w-10 font-medium text-ink">v{t.version}</span>
                <span className="w-36 text-muted">{formatDateTime(t.created_at)}</span>
                <span className="text-muted">Minimum score {t.minimum_fit_score} · {t.allowed_stages.map((s: string) => STAGE_LABELS[s as FundingStage] ?? s).join(", ")}</span>
                {t.active && <span className="font-medium text-ok">✓ Active</span>}
              </li>
            ))}
          </ul>
        </DisclosureSection>
        <div className="border-t border-line" />
      </div>
    </>
  );
}
