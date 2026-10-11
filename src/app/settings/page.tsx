import { thesisData, configured } from "@/lib/queries";
import { PageHeader, SetupNotice, StatusBadge } from "@/components/ui";
import { ThesisForm } from "@/components/thesis-form";
import { formatDateTime } from "@/lib/format";
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
      <PageHeader
        title="Thesis Settings"
        subtitle="Edit the accelerator thesis, filters and scoring weights. Saving creates a new version; every future assessment uses it automatically, and past assessments keep the version they were scored under. No redeploy needed."
        actions={<span className="text-sm text-slate-500">Active: version {active.version}</span>}
      />
      <ThesisForm key={active.id} initial={initial} version={active.version} />
      <h2 className="mb-3 mt-12 text-sm font-semibold text-slate-800">Version history</h2>
      <ul className="space-y-1 text-sm text-slate-600">
        {theses.map((t) => (
          <li key={t.id} className="flex items-center gap-3">
            <span className="w-16 font-medium">v{t.version}</span>
            <span className="w-40">{formatDateTime(t.created_at)}</span>
            <span>min score {t.minimum_fit_score} · {t.allowed_stages.join(", ")}</span>
            {t.active && <StatusBadge status="completed" />}
          </li>
        ))}
      </ul>
    </>
  );
}
