import { formatDateTime } from "@/lib/format";
import { sourceKindLabel, sourceShortName, verificationLabel } from "@/lib/labels";
import { CopyButton } from "./copy-button";
import { ExternalIcon } from "./icons";
import { StatusLabel, cx } from "./ui";

export const ExternalLink = ({ href, children, className = "" }: { href: string; children: React.ReactNode; className?: string }) => (
  <a href={href} target="_blank" rel="noreferrer noopener" className={cx("inline-flex items-center gap-1 text-accent hover:underline", className)}>
    {children}
    <ExternalIcon className="shrink-0 opacity-70" />
    <span className="sr-only">(opens in a new tab)</span>
  </a>
);

export const BulletList = ({ items, className = "" }: { items: string[]; className?: string }) => (
  <ul className={cx("space-y-1.5", className)}>
    {items.map((x, i) => (
      <li key={i} className="flex gap-2.5 text-body text-ink">
        <span className="mt-[0.7em] size-1 shrink-0 rounded-full bg-ink-3" aria-hidden="true" />
        <span>{x}</span>
      </li>
    ))}
  </ul>
);

export function FounderList({ founders }: { founders: any[] }) {
  if (founders.length === 0) return <p className="text-body text-ink-2">No founders identified from public sources.</p>;
  return (
    <ul className="divide-y divide-line">
      {founders.map((f) => (
        <li key={f.id} className="py-3 first:pt-0 last:pb-0">
          <p className="text-body font-medium text-ink">{f.name}{f.role && <span className="font-normal text-ink-2"> · {f.role}</span>}</p>
          <p className="mt-0.5 text-body text-ink-2">{f.background_summary ?? "Background not established."}</p>
          {f.linkedin_url && <ExternalLink href={f.linkedin_url} className="mt-1 text-meta">LinkedIn</ExternalLink>}
        </li>
      ))}
    </ul>
  );
}

/** Rounds → the articles that reported them (this is also where de-duplication is visible: many articles, one event). */
export function EvidenceList({ rounds, sources }: { rounds: any[]; sources: { url: string; kind: string; title: string | null }[] }) {
  return (
    <div className="space-y-6">
      <div>
        <h4 className="mb-2 text-body font-medium">Funding announcements</h4>
        {rounds.length === 0 ? (
          <p className="text-meta text-ink-3">No funding rounds recorded.</p>
        ) : (
          <div className="space-y-5">
            {rounds.map((r) => {
              const articles = r.funding_round_sources ?? [];
              return (
                <div key={r.id}>
                  <p className="text-body text-ink">
                    {r.stage} <span className="text-ink-3">· {r.amount != null ? `${r.amount} ${r.currency ?? ""}`.trim() : "amount not disclosed"}</span>
                  </p>
                  <p className="mt-0.5 text-meta text-ink-2">
                    Investors: {(r.funding_round_investors ?? []).map((i: any) => i.investors?.name + (i.is_lead ? " (lead)" : "")).join(", ") || "not stated"}
                  </p>
                  {articles.length > 1 && <p className="mt-0.5 text-meta text-ink-3">{articles.length} articles reported this round; they were merged into one funding event.</p>}
                  <ul className="mt-2 space-y-1.5">
                    {articles.map((s: any, i: number) => (
                      <li key={i} className="text-meta">
                        <ExternalLink href={s.funding_articles?.source_url ?? "#"}>{s.funding_articles?.headline ?? "Article"}</ExternalLink>
                        <span className="text-ink-3"> — {sourceShortName(s.sources?.name)}, published {formatDateTime(s.source_published_at)}, first seen {formatDateTime(s.first_seen_at)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        )}
      </div>
      <div>
        <h4 className="mb-2 text-body font-medium">Research sources</h4>
        {sources.length === 0 ? (
          <p className="text-meta text-ink-3">No research sources recorded.</p>
        ) : (
          <ul className="space-y-1.5">
            {sources.map((s, i) => (
              <li key={i} className="flex gap-2 text-meta">
                <span className="w-28 shrink-0 text-ink-3">{sourceKindLabel(s.kind)}</span>
                <ExternalLink href={s.url.startsWith("http") ? s.url : "#"} className="min-w-0 break-all">{s.title ?? s.url}</ExternalLink>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

const mailboxLabel = (c: any) => (c.kind === "contact_form" ? "Contact form" : c.kind === "founder" ? "Founder" : `Company${c.mailbox_role ? ` · ${c.mailbox_role}` : ""}`);

/** Every discovered contact with how it was verified. Unverified/guessed ones are kept for reference only. */
export function ContactList({ contacts }: { contacts: any[] }) {
  return (
    <div>
      <ul className="divide-y divide-line border-y border-line">
        {contacts.map((c) => (
          <li key={c.id} className="flex flex-wrap items-start gap-x-4 gap-y-1 py-3">
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-1 text-body text-ink">
                {c.email ? <><span className="break-all">{c.email}</span><CopyButton value={c.email} iconOnly label="Copy address" /></> : <ExternalLink href={c.contact_url}>Contact form</ExternalLink>}
                {c.is_preferred && <span className="ml-1 rounded-full bg-accent-soft px-2 text-label text-accent">Preferred</span>}
              </p>
              <p className="text-meta text-ink-3">
                {mailboxLabel(c)}{c.founder_name && ` · ${c.founder_name}`}
                {c.evidence && <> · {c.evidence}</>}
              </p>
              {c.mx_valid === false && <p className="text-meta text-bad">This domain has no mail server.</p>}
            </div>
            <div className="text-right">
              <StatusLabel label={verificationLabel(c.verification_status)} />
              <p className="text-meta text-ink-3">
                {c.source_url ? <ExternalLink href={c.source_url}>{String(c.discovery_source).replace("_", " ")}</ExternalLink> : String(c.discovery_source).replace("_", " ")} · checked {formatDateTime(c.last_checked_at)}
              </p>
            </div>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-meta text-ink-3">Guessed and unverified addresses are kept for reference only and are never filled into a draft. A valid mail domain does not prove a mailbox exists.</p>
    </div>
  );
}

/** The detailed scoring model, one block per thesis version it was scored under. */
export function ScoreBreakdown({ assessments, minFit }: { assessments: any[]; minFit: number | null }) {
  return (
    <div className="space-y-8">
      {assessments.map((a, idx) => {
        const criteria = (a.scoring_snapshot?.criteria ?? []) as { key: string; name: string; weight: number }[];
        return (
          <div key={a.id}>
            <p className="text-body text-ink">
              <span className="font-semibold tabular-nums">{a.total_score}</span> of 100 · {a.qualified ? "Qualified" : "Below your threshold"} (minimum {a.scoring_snapshot?.minimum_fit_score ?? minFit ?? "—"})
              <span className="text-ink-3"> · scored under thesis v{a.thesis_version}{idx === 0 ? " (latest)" : ""}</span>
            </p>
            <div className="mt-4 grid gap-x-10 gap-y-3 sm:grid-cols-2">
              {criteria.map((c) => {
                const v = a.criterion_scores_json?.[c.key] ?? 0;
                return (
                  <div key={c.key}>
                    <div className="flex justify-between text-meta text-ink-2"><span>{c.name}</span><span className="tabular-nums">{v} / {c.weight}</span></div>
                    <div className="mt-1 h-1 rounded-full bg-line" role="progressbar" aria-label={c.name} aria-valuemin={0} aria-valuemax={c.weight} aria-valuenow={v}>
                      <div className="h-1 rounded-full bg-accent" style={{ width: `${c.weight ? (v / c.weight) * 100 : 0}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
            {a.reasoning && <p className="mt-4 text-body text-ink-2">{a.reasoning}</p>}
            {idx > 0 && a.positive_signals?.length > 0 && <div className="mt-4"><p className="mb-1 text-label text-ink-3">Positive signals</p><BulletList items={a.positive_signals} /></div>}
            {a.concerns?.length > 0 && <div className="mt-4"><p className="mb-1 text-label text-ink-3">Concerns</p><BulletList items={a.concerns} /></div>}
            <p className="mt-3 text-meta text-ink-3">Scored {formatDateTime(a.assessed_at)} · {a.model_name}</p>
          </div>
        );
      })}
    </div>
  );
}
