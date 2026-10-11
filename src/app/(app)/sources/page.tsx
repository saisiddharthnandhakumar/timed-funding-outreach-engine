import { sourcesData, configured } from "@/lib/queries";
import { Badge, PageHeader, SetupNotice, StatusBadge, Table, Td } from "@/components/ui";
import { formatDateTime, formatDelay, timeAgo } from "@/lib/format";
import { toggleSource } from "./actions";

export const dynamic = "force-dynamic";

export default async function SourcesPage() {
  if (!configured()) return <SetupNotice message="Supabase is not configured." />;
  const { sources, articleCounts, metrics } = await sourcesData();
  return (
    <>
      <PageHeader title="Sources / Health" subtitle="Polling health per source, plus early speed metrics computed from real events (needs events reported by several sources to become meaningful)." />
      <Table head={["Source", "Enabled", "Last polled", "Last success", "Items (last poll)", "Articles stored", "Latest error"]}>
        {sources.map((s) => (
          <tr key={s.id}>
            <Td><div className="font-medium text-slate-900">{s.name}</div><div className="text-xs text-slate-400">{s.type} · every {s.poll_interval_minutes} min</div></Td>
            <Td>
              <form action={toggleSource}>
                <input type="hidden" name="id" value={s.id} />
                <input type="hidden" name="enabled" value={String(!s.enabled)} />
                <button className="text-xs underline">{s.enabled ? <Badge tone="green">enabled</Badge> : <Badge>disabled</Badge>}</button>
              </form>
            </Td>
            <Td>{timeAgo(s.last_polled_at)}</Td>
            <Td>{s.last_success_at ? <>{timeAgo(s.last_success_at)}<div className="text-xs text-slate-400">{formatDateTime(s.last_success_at)}</div></> : "never"}</Td>
            <Td>{s.last_items_found}</Td>
            <Td>{articleCounts.get(s.id) ?? 0}</Td>
            <Td className="max-w-xs text-xs text-rose-700">{s.last_error ?? <StatusBadge status={s.last_success_at ? "completed" : "pending"} />}</Td>
          </tr>
        ))}
      </Table>

      <h2 className="mb-3 mt-10 text-sm font-semibold text-slate-800">Source performance</h2>
      <Table head={["Source", "Funding reports", "Avg ingestion delay", "Wins (earliest to publish)", "Unique discoveries"]}>
        {sources.map((s) => {
          const m = metrics.get(s.id)!;
          const avg = m.delays.length ? m.delays.reduce((a, b) => a + b, 0) / m.delays.length : null;
          return (
            <tr key={s.id}>
              <Td className="font-medium">{s.name}</Td>
              <Td>{m.reports}</Td>
              <Td>{formatDelay(avg)}</Td>
              <Td>{m.wins}</Td>
              <Td>{m.unique}</Td>
            </tr>
          );
        })}
      </Table>
      <p className="mt-3 text-xs text-slate-400">Ingestion delay = first_seen_at − source_published_at. Wins = events where this source published first. Unique = events only this source reported.</p>
    </>
  );
}
