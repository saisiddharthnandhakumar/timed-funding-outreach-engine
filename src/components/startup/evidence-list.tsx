import { formatAmount, formatDateTime, stageLabel } from "@/lib/format";
import { prettyCode, rejectionLabel, roundStatusLabel } from "@/lib/labels";
import { Tag, TextLink } from "../ui";

/** Level 2: where the facts came from, with exact timestamps. */
export function EvidenceList({ rounds, researchSources, confidence }: { rounds: any[]; researchSources: { url: string; kind: string; title: string | null }[]; confidence: number | null }) {
  return (
    <div className="space-y-8">
      <div className="space-y-6">
        {rounds.map((r) => (
          <div key={r.id}>
            <p className="text-sm font-medium text-ink">
              {r.stage && r.stage !== "unknown" ? stageLabel(r.stage) : "Funding round"} · {formatAmount(r.amount, r.currency)}
              <span className="font-normal text-muted"> · {roundStatusLabel(r.status)}{r.rejection_reason ? ` (${rejectionLabel(r.rejection_reason)})` : ""}</span>
            </p>
            <p className="mt-1 text-sm text-muted">Investors: {(r.funding_round_investors ?? []).map((i: any) => i.investors?.name + (i.is_lead ? " (lead)" : "")).join(", ") || "not stated"}</p>
            <ul className="mt-2 space-y-1.5 text-sm">
              {(r.funding_round_sources ?? []).map((s: any, i: number) => (
                <li key={i}>
                  <TextLink href={s.funding_articles?.source_url} external>{s.funding_articles?.headline}</TextLink>
                  <span className="block text-xs text-faint">{s.sources?.name} · published {formatDateTime(s.source_published_at)} · first seen {formatDateTime(s.first_seen_at)}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <div>
        <div className="mb-2 text-xs font-medium text-faint">Research sources</div>
        {researchSources.length === 0 ? (
          <p className="text-sm text-muted">No research sources recorded.</p>
        ) : (
          <ul className="space-y-1.5 text-sm">
            {researchSources.map((s, i) => (
              <li key={i} className="flex flex-wrap items-baseline gap-2"><Tag>{prettyCode(s.kind)}</Tag><TextLink href={s.url} external>{s.title ?? s.url}</TextLink></li>
            ))}
          </ul>
        )}
      </div>

      {confidence != null && <p className="text-sm text-muted">Assessment confidence: <span className="num text-ink">{Math.round(confidence * 100)}%</span></p>}
    </div>
  );
}
