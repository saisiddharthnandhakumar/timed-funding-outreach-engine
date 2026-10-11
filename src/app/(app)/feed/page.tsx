import { feedData, configured } from "@/lib/queries";
import { Badge, PageHeader, SetupNotice, StartupLink, StatusBadge, Table, Td } from "@/components/ui";
import { formatAmount, formatDateTime, stageLabel, timeAgo } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function FeedPage() {
  if (!configured()) return <SetupNotice message="Supabase is not configured." />;
  const { rounds, filtered } = await feedData();
  return (
    <>
      <PageHeader title="Funding Feed" subtitle="Every funding event the pipeline identified. One row per real-world round, with every publication that reported it." />
      <Table head={["Startup", "Stage", "Amount", "Reported by (published → first seen)", "Status"]} empty="No funding events yet. Run the pipeline.">
        {rounds.map((r) => (
          <tr key={r.id}>
            <Td>
              <StartupLink id={r.startups.id} name={r.startups.name} />
              <div className="text-xs text-slate-400">{r.startups.sector ?? ""}</div>
            </Td>
            <Td>{stageLabel(r.stage)}</Td>
            <Td>{formatAmount(r.amount, r.currency)}</Td>
            <Td>
              <ul className="space-y-1">
                {(r.funding_round_sources ?? []).map((s: any, i: number) => (
                  <li key={i} className="text-xs text-slate-600">
                    <a href={s.funding_articles?.source_url} target="_blank" rel="noreferrer" className="font-medium text-slate-800 hover:underline">{s.sources?.name}</a>
                    {" · "}{formatDateTime(s.source_published_at)} → {formatDateTime(s.first_seen_at)}
                    <span className="text-slate-400"> ({timeAgo(s.source_published_at)})</span>
                  </li>
                ))}
              </ul>
            </Td>
            <Td>
              <StatusBadge status={r.status} />
              {r.rejection_reason && <div className="mt-1 text-xs text-slate-500">{r.rejection_reason.replace(/_/g, " ")}</div>}
            </Td>
          </tr>
        ))}
      </Table>

      <h2 className="mb-3 mt-10 text-sm font-semibold text-slate-800">Filtered-out & pending articles (latest 60)</h2>
      <Table head={["Article", "Source", "Published", "First seen", "Outcome"]} empty="Nothing filtered yet.">
        {filtered.map((a) => (
          <tr key={a.id}>
            <Td className="max-w-md"><a href={a.source_url} target="_blank" rel="noreferrer" className="hover:underline">{a.headline}</a></Td>
            <Td>{a.sources?.name}</Td>
            <Td className="whitespace-nowrap">{formatDateTime(a.source_published_at)}</Td>
            <Td className="whitespace-nowrap">{formatDateTime(a.first_seen_at)}</Td>
            <Td>
              <StatusBadge status={a.processing_status} />
              {a.rejection_reason && <Badge>{a.rejection_reason.replace(/_/g, " ")}</Badge>}
            </Td>
          </tr>
        ))}
      </Table>
    </>
  );
}
