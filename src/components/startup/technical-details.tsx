import { formatDateTime } from "@/lib/format";

const Row = ({ k, children }: { k: string; children: React.ReactNode }) => (
  <div className="grid gap-1 py-2 sm:grid-cols-[11rem_1fr] sm:gap-4">
    <dt className="text-faint">{k}</dt>
    <dd className="min-w-0 break-words font-mono text-xs text-muted">{children}</dd>
  </div>
);

/** Level 3: audit and debugging. Machine codes are intentionally shown raw here. */
export function TechnicalDetails({ d }: { d: { startup: any; rounds: any[]; assessments: any[]; outreach: any[]; events: any[]; evidence?: any[] } }) {
  const { startup, rounds, assessments, outreach, events } = d;
  const evidence = d.evidence ?? [];
  const conflicts = evidence.filter((e: any) => e.conflict_json);
  return (
    <div className="space-y-6">
      <dl className="divide-y divide-line">
        <Row k="Pipeline state">
          {rounds.map((r) => `${r.id.slice(0, 8)}: ${r.status}${r.rejection_reason ? ` / ${r.rejection_reason}` : ""} (attempts ${r.attempts}${r.last_error ? `, error: ${r.last_error}` : ""})`).join("\n") || "—"}
          <br />research: {startup.enrichment_status} · contacts: {startup.contact_status ?? "n/a"}
        </Row>
        <Row k="Thesis version">{assessments.map((a) => `v${a.thesis_version} (${a.total_score}, ${a.qualified ? "qualified" : "not qualified"})`).join(" · ") || "—"}</Row>
        <Row k="Model metadata">{assessments.map((a) => `${a.model_name}${a.confidence != null ? `, confidence ${a.confidence}` : ""}`).join(" · ") || "—"}{outreach[0]?.model_name ? ` · draft: ${outreach[0].model_name}` : ""}</Row>
        <Row k="Dedupe">
          normalised name: {startup.normalized_name} · domain: {startup.domain ?? "none"}
          <br />
          {rounds.map((r) => `round ${r.id.slice(0, 8)}: ${(r.funding_round_sources ?? []).length} merged report(s)`).join(" · ")}
        </Row>
        <Row k="Internal IDs">
          startup {startup.id}
          {rounds.map((r) => <span key={r.id}><br />round {r.id}</span>)}
          {assessments.map((a) => <span key={a.id}><br />assessment {a.id}</span>)}
          {outreach.map((o) => <span key={o.id}><br />outreach {o.id}{o.external_draft_id ? ` (external draft ${o.external_draft_id})` : ""}</span>)}
        </Row>
      </dl>

      {evidence.length > 0 && (
        <div>
          <div className="mb-2 text-xs font-medium text-faint">Evidence{conflicts.length > 0 ? ` · ${conflicts.length} disagreement${conflicts.length === 1 ? "" : "s"} flagged` : ""}</div>
          <ul className="space-y-1.5 font-mono text-xs text-muted">
            {evidence.map((e: any) => (
              <li key={e.id} className="break-words">
                <span className="text-faint">{e.field_key}</span> = {typeof e.value_json === "string" ? e.value_json : JSON.stringify(e.value_json)}
                {" "}· {String(e.evidence_type).replace(/_/g, " ")}{e.sources?.name ? ` (${e.sources.name})` : ""} · {e.confidence}
                {e.conflict_json ? <span className="text-bad"> · conflicts with {(e.conflict_json.values ?? []).map((v: any) => `${v.sourceKey}: ${typeof v.value === "string" ? v.value : JSON.stringify(v.value)}`).join(" vs ")}</span> : null}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div>
        <div className="mb-2 text-xs font-medium text-faint">Pipeline events</div>
        {events.length === 0 ? (
          <p className="text-sm text-muted">No events recorded for this startup.</p>
        ) : (
          <ul className="space-y-1.5 font-mono text-xs text-muted">
            {events.map((e: any) => (
              <li key={e.id} className="break-words"><span className="text-faint">{formatDateTime(e.created_at)}</span> {e.event_type} — {e.message}</li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
