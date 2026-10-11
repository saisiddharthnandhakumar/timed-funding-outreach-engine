import { notFound } from "next/navigation";
import { startupDetail, configured } from "@/lib/queries";
import { Badge, Card, PageHeader, ScorePill, SetupNotice, StatusBadge } from "@/components/ui";
import { formatAmount, formatDateTime, stageLabel } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function StartupPage({ params }: { params: Promise<{ id: string }> }) {
  if (!configured()) return <SetupNotice message="Supabase is not configured." />;
  const { id } = await params;
  const d = await startupDetail(id);
  if (!d) notFound();
  const { startup, founders, rounds, assessments, outreach } = d;
  const p = startup.profile_json as Record<string, any> | null;
  const sources = (startup.research_sources ?? []) as { url: string; kind: string; title: string | null }[];

  return (
    <>
      <PageHeader title={startup.name} subtitle={startup.description ?? undefined} actions={<StatusBadge status={startup.enrichment_status} />} />
      <div className="grid gap-6 lg:grid-cols-3">
        <Card title="Company profile" className="lg:col-span-2">
          <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
            {([
              ["Website", startup.website ? <a key="w" href={startup.website} target="_blank" rel="noreferrer" className="text-indigo-700 hover:underline">{startup.domain ?? startup.website}</a> : "Unknown"],
              ["HQ", [startup.hq_city, startup.hq_country].filter(Boolean).join(", ") || "Unknown"],
              ["Sector", [startup.sector, startup.subsector].filter(Boolean).join(" / ") || "Unknown"],
              ["Business model", startup.business_model ?? "Unknown"],
              ["Founded", startup.founded_year ?? "Unknown"],
              ["Product", p?.product ?? "Unknown"],
              ["Target customer", p?.target_customer ?? "Unknown"],
              ["Technology", p?.technology ?? "Unknown"],
              ["Market", p?.market ?? "Unknown"],
              ["Differentiation", p?.competitive_differentiation ?? "Unknown"],
            ] as [string, React.ReactNode][]).map(([k, v]) => (
              <div key={k}><dt className="text-xs uppercase tracking-wide text-slate-400">{k}</dt><dd className="mt-0.5 text-slate-800">{v}</dd></div>
            ))}
          </dl>
          {p && (["traction", "customers", "partnerships"] as const).map((k) => (
            <div key={k} className="mt-4">
              <div className="text-xs uppercase tracking-wide text-slate-400">{k}</div>
              {(p[k] as string[])?.length ? <ul className="mt-1 list-disc pl-5 text-sm text-slate-700">{(p[k] as string[]).map((x, i) => <li key={i}>{x}</li>)}</ul> : <div className="text-sm text-slate-500">None found</div>}
            </div>
          ))}
          {(p?.unknowns?.length ?? 0) > 0 && p && <p className="mt-4 text-xs text-slate-400">Not established by research: {(p.unknowns as string[]).join(", ")}</p>}
        </Card>

        <Card title="Founders">
          {founders.length === 0 ? <p className="text-sm text-slate-500">No founders identified from public sources.</p> : (
            <ul className="space-y-3 text-sm">
              {founders.map((f: any) => (
                <li key={f.id}>
                  <div className="font-medium text-slate-900">{f.name} {f.role && <span className="font-normal text-slate-500">· {f.role}</span>}</div>
                  <div className="text-slate-600">{f.background_summary ?? "Background not established."}</div>
                  {f.linkedin_url && <a href={f.linkedin_url} target="_blank" rel="noreferrer" className="text-xs text-indigo-700 hover:underline">LinkedIn</a>}
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card title="Funding rounds & source articles">
          <div className="space-y-5">
            {rounds.map((r: any) => (
              <div key={r.id}>
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <Badge tone="indigo">{stageLabel(r.stage)}</Badge>
                  <span className="font-medium">{formatAmount(r.amount, r.currency)}</span>
                  <StatusBadge status={r.status} />
                  {r.rejection_reason && <span className="text-xs text-slate-500">{r.rejection_reason.replace(/_/g, " ")}</span>}
                </div>
                <div className="mt-1 text-xs text-slate-500">Investors: {(r.funding_round_investors ?? []).map((i: any) => i.investors?.name + (i.is_lead ? " (lead)" : "")).join(", ") || "not stated"}</div>
                <ul className="mt-2 space-y-1 text-xs">
                  {(r.funding_round_sources ?? []).map((s: any, i: number) => (
                    <li key={i}><a href={s.funding_articles?.source_url} target="_blank" rel="noreferrer" className="text-indigo-700 hover:underline">{s.funding_articles?.headline}</a> <span className="text-slate-400">— {s.sources?.name}, {formatDateTime(s.source_published_at)}</span></li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </Card>

        <Card title="Research evidence">
          {sources.length === 0 ? <p className="text-sm text-slate-500">No research sources recorded.</p> : (
            <ul className="space-y-1 text-xs">
              {sources.map((s, i) => (
                <li key={i} className="truncate"><Badge>{s.kind.replace(/_/g, " ")}</Badge> <a href={s.url} target="_blank" rel="noreferrer" className="text-indigo-700 hover:underline">{s.title ?? s.url}</a></li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {assessments.map((a: any) => (
        <Card key={a.id} title={`Fit assessment — thesis v${a.thesis_version}`} className="mt-6">
          <div className="flex items-center gap-3 text-sm">
            <ScorePill score={a.total_score} /> <span className="text-slate-500">{a.qualified ? "Qualified" : "Below threshold"} (min {a.scoring_snapshot?.minimum_fit_score}) · {formatDateTime(a.assessed_at)} · {a.model_name}</span>
          </div>
          <div className="mt-4 grid gap-6 md:grid-cols-2">
            <div className="space-y-2">
              {(a.scoring_snapshot?.criteria ?? []).map((c: { key: string; name: string; weight: number }) => {
                const v = a.criterion_scores_json?.[c.key] ?? 0;
                return (
                  <div key={c.key}>
                    <div className="flex justify-between text-xs text-slate-600"><span>{c.name}</span><span>{v} / {c.weight}</span></div>
                    <div className="mt-1 h-1.5 rounded bg-slate-100"><div className="h-1.5 rounded bg-indigo-500" style={{ width: `${c.weight ? (v / c.weight) * 100 : 0}%` }} /></div>
                  </div>
                );
              })}
            </div>
            <div className="space-y-3 text-sm">
              <div><div className="text-xs uppercase tracking-wide text-slate-400">Positive signals</div><ul className="list-disc pl-5 text-slate-700">{a.positive_signals.map((s: string, i: number) => <li key={i}>{s}</li>)}</ul></div>
              <div><div className="text-xs uppercase tracking-wide text-slate-400">Concerns</div>{a.concerns.length ? <ul className="list-disc pl-5 text-slate-700">{a.concerns.map((s: string, i: number) => <li key={i}>{s}</li>)}</ul> : <span className="text-slate-500">None noted</span>}</div>
              <p className="text-slate-600">{a.reasoning}</p>
            </div>
          </div>
        </Card>
      ))}

      {outreach.map((o: any) => (
        <Card key={o.id} title="Generated outreach" className="mt-6">
          <div className="mb-3 flex items-center gap-2 text-xs text-slate-500"><StatusBadge status={o.status} /> via {o.draft_provider}{o.recipient_name && <> · to {o.recipient_name}</>}</div>
          <div className="text-sm font-medium text-slate-900">{o.subject}</div>
          <pre className="mt-2 whitespace-pre-wrap font-sans text-sm text-slate-700">{o.body}</pre>
        </Card>
      ))}
    </>
  );
}
