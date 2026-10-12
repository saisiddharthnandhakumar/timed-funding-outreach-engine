import { ago } from "@/lib/format";
import { DRAFT_STATE_LABEL, type DraftState } from "@/lib/labels";
import { FIT_TIER_LABEL, fitTier, type Opportunity } from "@/lib/opportunity/model";
import { stageLabel } from "@/lib/format";
import { MetaLine, StatusChip, Tag, type Tone } from "../ui";

/** "Fit 87". The tier word and the full scale are available to everyone, not only through colour. */
export function FitIndicator({ score, minimum, size = "md" }: { score: number | null; minimum?: number; size?: "md" | "lg" }) {
  if (score == null) return <span className="text-sm text-faint">Not scored</span>;
  const tier = fitTier(score, minimum);
  return (
    <div className="text-right">
      <div className="flex items-baseline justify-end gap-1.5" aria-hidden="true">
        <span className="text-xs font-medium text-faint">Fit</span>
        <span className={`num font-semibold tracking-tight ${size === "lg" ? "text-4xl" : "text-2xl"} ${tier === "strong" ? "text-accent" : "text-ink"}`}>{score}</span>
      </div>
      <span className="sr-only">{FIT_TIER_LABEL[tier]}, {score} out of 100</span>
    </div>
  );
}

/** Stage · amount · location · how recent. */
export function FundingMeta({ o, now }: { o: Pick<Opportunity, "stage" | "amountText" | "location" | "announcedAt">; now?: Date }) {
  return (
    <MetaLine
      parts={[
        o.stage && o.stage !== "unknown" ? stageLabel(o.stage) : null,
        o.amountText !== "Undisclosed" ? o.amountText : null,
        o.location,
        o.announcedAt ? <span key="ago" title={new Date(o.announcedAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}>{ago(o.announcedAt, now)}</span> : null,
      ]}
    />
  );
}

const DRAFT_TONE: Record<DraftState, Tone> = { none: "neutral", ready: "accent", approved: "ok", sent: "ok", rejected: "neutral" };
export function DraftStatus({ state }: { state: DraftState }) {
  return <StatusChip tone={DRAFT_TONE[state]}>{DRAFT_STATE_LABEL[state]}</StatusChip>;
}

export function SectorTag({ o }: { o: Pick<Opportunity, "subsector" | "sector"> }) {
  const label = o.subsector ?? o.sector;
  return label ? <Tag>{label}</Tag> : null;
}

const Label = ({ children }: { children: React.ReactNode }) => <div className="mb-1 text-xs font-medium text-faint">{children}</div>;

export function WhyNow({ text }: { text: string }) {
  return (
    <div>
      <Label>Why now</Label>
      <p className="text-[0.95rem] leading-snug text-ink">{text}</p>
    </div>
  );
}

export function WhyFit({ reasons }: { reasons: string[] }) {
  if (!reasons.length) return null;
  return (
    <div>
      <Label>Why it fits</Label>
      <p className="text-[0.95rem] leading-snug text-ink">{reasons.join(" · ")}</p>
    </div>
  );
}
