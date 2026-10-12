import Link from "next/link";
import type { Opportunity } from "@/lib/opportunity/model";
import { Card } from "../ui";
import { DraftStatus, FitIndicator, FundingMeta, SectorTag, WhyFit, WhyNow } from "./parts";

const trim = (s: string | null, n = 110) => (s && s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);

function ReviewLink({ o, label = "Review" }: { o: Opportunity; label?: string }) {
  return (
    <Link href={`/opportunities/${o.startupId}`} className="inline-flex min-h-10 items-center gap-1.5 text-sm font-semibold text-accent after:absolute after:inset-0 after:content-[''] hover:underline">
      {label}
      <span aria-hidden="true">→</span>
      <span className="sr-only"> {o.name}</span>
    </Link>
  );
}

/** Today's priority card: understood in five seconds. One obvious action: Review. */
export function OpportunityCard({ o, minimum, now }: { o: Opportunity; minimum?: number; now?: Date }) {
  return (
    <Card as="article" className="relative p-5 transition-colors hover:border-field sm:p-6">
      <div className="flex items-start justify-between gap-4">
        <h3 className="min-w-0 text-lg font-semibold tracking-tight text-ink">{o.name}</h3>
        <FitIndicator score={o.fit} minimum={minimum} />
      </div>
      {o.description && <p className="mt-1 text-[0.95rem] leading-relaxed text-muted">{trim(o.description)}</p>}
      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2">
        <FundingMeta o={o} now={now} />
        <SectorTag o={o} />
      </div>
      <div className="mt-5 grid gap-5 sm:grid-cols-2">
        <WhyNow text={o.whyNow.summary} />
        <WhyFit reasons={o.whyFit} />
      </div>
      <div className="mt-5 flex items-center justify-between gap-3 border-t border-line pt-4">
        <DraftStatus state={o.draftState} />
        <div className="flex items-center gap-1">
          <ReviewLink o={o} />
        </div>
      </div>
    </Card>
  );
}

/** The compact version for the Opportunities queue: same facts, hairline-separated, no card chrome. */
export function OpportunityRow({ o, minimum, now }: { o: Opportunity; minimum?: number; now?: Date }) {
  return (
    <li className="relative py-5 first:pt-0">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 className="text-[1.05rem] font-semibold tracking-tight text-ink">{o.name}</h2>
          {o.description && <p className="mt-0.5 text-sm text-muted">{trim(o.description, 130)}</p>}
        </div>
        <FitIndicator score={o.fit} minimum={minimum} />
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2">
        <FundingMeta o={o} now={now} />
        <SectorTag o={o} />
      </div>
      <div className="mt-3 grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
        <WhyNow text={o.whyNow.summary} />
        <WhyFit reasons={o.whyFit} />
      </div>
      <div className="mt-3 flex items-center justify-between gap-3">
        <DraftStatus state={o.draftState} />
        <div className="flex items-center gap-1">
          <ReviewLink o={o} />
        </div>
      </div>
    </li>
  );
}
