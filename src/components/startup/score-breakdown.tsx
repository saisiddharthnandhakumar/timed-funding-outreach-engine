import { formatDateTime } from "@/lib/format";
import { BulletList } from "./fields";

/** One assessment's full reasoning: criterion bars, concerns, narrative. Collapsed by default upstream. */
export function ScoreBreakdown({ a, latest }: { a: any; latest: boolean }) {
  const criteria = (a.scoring_snapshot?.criteria ?? []) as { key: string; name: string; weight: number }[];
  return (
    <div className={latest ? "" : "mt-8 border-t border-line pt-6"}>
      <p className="text-sm text-muted">
        <span className="num font-semibold text-ink">{a.total_score} / 100</span> · {a.qualified ? "Qualified" : "Below threshold"} (minimum {a.scoring_snapshot?.minimum_fit_score})
        <span className="text-faint"> · Scored against thesis v{a.thesis_version}, {formatDateTime(a.assessed_at)}{latest ? "" : " · earlier version"}</span>
      </p>
      <div className="mt-4 grid gap-8 md:grid-cols-2">
        <ul className="space-y-3">
          {criteria.map((c) => {
            const v = a.criterion_scores_json?.[c.key] ?? 0;
            const pct = c.weight ? Math.round((v / c.weight) * 100) : 0;
            return (
              <li key={c.key}>
                <div className="flex justify-between text-sm text-muted"><span>{c.name}</span><span className="num">{v} / {c.weight}</span></div>
                <div className="mt-1 h-1.5 rounded-full bg-sunken" role="progressbar" aria-label={c.name} aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}>
                  <div className="h-1.5 rounded-full bg-accent" style={{ width: `${pct}%` }} />
                </div>
              </li>
            );
          })}
        </ul>
        <div className="space-y-5">
          <div>
            <div className="mb-1.5 text-xs font-medium text-faint">Concerns</div>
            {a.concerns?.length ? <BulletList items={a.concerns} /> : <p className="text-sm text-muted">None noted.</p>}
          </div>
          {a.reasoning && (
            <div>
              <div className="mb-1.5 text-xs font-medium text-faint">Reasoning</div>
              <p className="text-[0.95rem] leading-relaxed text-ink">{a.reasoning}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
