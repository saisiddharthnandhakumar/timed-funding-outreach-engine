import { qualifiedData, configured } from "@/lib/queries";
import { PageHeader, ScorePill, SetupNotice, StartupLink, StatusBadge, Table, Td } from "@/components/ui";
import { formatAmount, stageLabel, timeAgo } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function QualifiedPage() {
  if (!configured()) return <SetupNotice message="Supabase is not configured." />;
  const { assessments, outreachByStartup } = await qualifiedData();
  return (
    <>
      <PageHeader title="Qualified Startups" subtitle="Startups that cleared every hard filter and scored at or above the active thesis threshold." />
      <Table head={["Startup", "Sector", "Funding", "Fit", "Top reasons", "Research", "Draft"]} empty="No qualified startups yet.">
        {assessments.map((a) => (
          <tr key={a.id}>
            <Td><StartupLink id={a.startups.id} name={a.startups.name} /><div className="text-xs text-slate-400">scored {timeAgo(a.assessed_at)} · thesis v{a.thesis_version}</div></Td>
            <Td>{a.startups.sector ?? "—"}{a.startups.subsector && <div className="text-xs text-slate-400">{a.startups.subsector}</div>}</Td>
            <Td>{stageLabel(a.funding_rounds?.stage)} · {formatAmount(a.funding_rounds?.amount, a.funding_rounds?.currency)}</Td>
            <Td><ScorePill score={a.total_score} /></Td>
            <Td className="max-w-sm"><ul className="list-disc space-y-0.5 pl-4 text-xs text-slate-600">{(a.positive_signals ?? []).slice(0, 3).map((s: string, i: number) => <li key={i}>{s}</li>)}</ul></Td>
            <Td><StatusBadge status={a.startups.enrichment_status} /></Td>
            <Td><StatusBadge status={outreachByStartup.get(a.startup_id) ?? "none"} /></Td>
          </tr>
        ))}
      </Table>
    </>
  );
}
