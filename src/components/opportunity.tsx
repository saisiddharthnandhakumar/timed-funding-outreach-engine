import Link from "next/link";
import type { ReactNode } from "react";
import { draftLabel } from "@/lib/labels";
import type { Opportunity } from "@/lib/opportunities/derive";
import { ArrowRight } from "./icons";
import { StatusLabel, cx } from "./ui";

/** Fit is the only score shown. A word accompanies the number so colour is never the only signal. */
export function FitIndicator({ score, label, size = "md", showLabel = false }: { score: number; label: string; size?: "md" | "lg"; showLabel?: boolean }) {
  return (
    <div className="shrink-0 text-right">
      <span className="sr-only">{`Fit ${score} of 100, ${label.toLowerCase()}`}</span>
      <div className="flex items-baseline justify-end gap-1.5" aria-hidden="true">
        <span className="text-label text-ink-3">Fit</span>
        <span className={cx("font-semibold tabular-nums leading-none tracking-tight text-ink", size === "lg" ? "text-[2rem]" : "text-[1.375rem]")}>{score}</span>
      </div>
      <div className="ml-auto mt-1.5 h-[3px] w-12 overflow-hidden rounded-full bg-line" aria-hidden="true">
        <div className="h-full rounded-full bg-ink" style={{ width: `${Math.max(4, Math.min(100, score))}%` }} />
      </div>
      {showLabel && <p className="mt-1.5 text-meta font-medium text-ink" aria-hidden="true">{label}</p>}
    </div>
  );
}

/** “Seed · ₹18 Cr · 2h ago” */
export function FundingMeta({ o, className = "" }: { o: Pick<Opportunity, "stageLabel" | "fundingLabel" | "announcedAgo" | "amount">; className?: string }) {
  const parts = [o.stageLabel !== "—" ? o.stageLabel : null, o.amount != null ? o.fundingLabel : null, o.announcedAgo !== "—" ? o.announcedAgo : null].filter(Boolean) as string[];
  return (
    <p className={cx("text-meta text-ink-2", className)}>
      {parts.map((p, i) => (
        <span key={i}>
          {i > 0 && <span className="px-1.5 text-line-strong" aria-hidden="true">·</span>}
          {p}
        </span>
      ))}
    </p>
  );
}

function Labelled({ label, children, className = "" }: { label: string; children: ReactNode; className?: string }) {
  return (
    <div className={className}>
      <p className="text-label text-ink-3">{label}</p>
      <p className="mt-0.5 text-body text-ink">{children}</p>
    </div>
  );
}
export const WhyNow = ({ text, className }: { text: string; className?: string }) => <Labelled label="Why now" className={className}>{text}</Labelled>;
export const RecommendedAngle = ({ text, className }: { text: string; className?: string }) => <Labelled label="Recommended angle" className={className}>{text}</Labelled>;

const sectorLine = (o: Opportunity) => [o.subsector ?? o.sector, o.location].filter(Boolean).join(" · ");

/**
 * Today: one startup, answered in about five seconds. The whole card is one link (the “Review” link
 * stretches over it), so there is no second competing control. Secondary actions live on the detail page.
 */
export function OpportunityCard({ o, rank }: { o: Opportunity; rank?: number }) {
  return (
    <article className="group relative -mx-4 rounded-lg px-4 py-6 hover:bg-sunken/70 has-[a:focus-visible]:bg-sunken/70 sm:-mx-5 sm:px-5">
      <div className="flex items-start gap-4">
        {rank != null && <span className="mt-1 hidden w-5 shrink-0 text-meta tabular-nums text-ink-3 sm:block" aria-hidden="true">{rank}</span>}
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <h3 className="truncate text-name text-ink">{o.name}</h3>
              <FundingMeta o={o} className="mt-0.5" />
              {sectorLine(o) && <p className="text-meta text-ink-3">{sectorLine(o)}</p>}
            </div>
            <FitIndicator score={o.fit} label={o.fitLabel} />
          </div>
          {o.description && <p className="mt-3 line-clamp-1 max-w-2xl text-body text-ink-2">{o.description}</p>}
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <WhyNow text={o.whyNow} />
            {o.angle && <RecommendedAngle text={o.angle} />}
          </div>
          <div className="mt-4 flex items-center justify-between gap-4">
            <StatusLabel label={draftLabel(o.draftStatus)} muted={!o.draftStatus} />
            <Link href={`/opportunities/${o.id}`} className="inline-flex items-center gap-1.5 rounded-md text-meta font-medium text-accent after:absolute after:inset-0 after:rounded-lg">
              Review<span className="sr-only"> {o.name}</span> <ArrowRight className="transition-transform duration-200 group-hover:translate-x-0.5" />
            </Link>
          </div>
        </div>
      </div>
    </article>
  );
}

/** Opportunities: a compact, scannable row. Stretched link on the name; no inner controls. */
export function OpportunityRow({ o }: { o: Opportunity }) {
  return (
    <li className="group relative -mx-4 flex gap-4 rounded-lg px-4 py-4 hover:bg-sunken/70 has-[a:focus-visible]:bg-sunken/70 sm:-mx-5 sm:px-5">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
          <h3 className="text-heading text-ink">
            <Link href={`/opportunities/${o.id}`} className="after:absolute after:inset-0 after:rounded-lg">{o.name}</Link>
          </h3>
          <FundingMeta o={o} />
        </div>
        {sectorLine(o) && <p className="text-meta text-ink-3">{sectorLine(o)}</p>}
        {o.description && <p className="mt-1.5 line-clamp-1 text-body text-ink-2">{o.description}</p>}
        <p className="mt-1 line-clamp-1 text-meta text-ink-2"><span className="text-ink-3">Why now · </span>{o.whyNow}</p>
      </div>
      <div className="flex shrink-0 flex-col items-end justify-between gap-2">
        <FitIndicator score={o.fit} label={o.fitLabel} />
        <StatusLabel label={draftLabel(o.draftStatus)} muted={!o.draftStatus} />
      </div>
    </li>
  );
}

export function OpportunityRowSkeleton() {
  return (
    <li className="flex gap-4 py-4" aria-hidden="true">
      <div className="flex-1 space-y-2.5">
        <div className="skeleton h-5 w-48" />
        <div className="skeleton h-3.5 w-64" />
        <div className="skeleton h-4 w-full max-w-lg" />
      </div>
      <div className="skeleton h-10 w-16" />
    </li>
  );
}
