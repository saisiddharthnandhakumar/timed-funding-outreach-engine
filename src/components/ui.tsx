import type { ReactNode } from "react";
import type { Label, Tone } from "@/lib/labels";
import { AlertIcon, ChevronRight } from "./icons";

export const cx = (...a: (string | false | null | undefined)[]) => a.filter(Boolean).join(" ");

/* ─── Buttons ──────────────────────────────────────────────────────────────────────────────────
 * One primary per screen. `buttonClass` styles <button> and <Link> alike. */
type Variant = "primary" | "secondary" | "ghost" | "danger";
const VARIANT: Record<Variant, string> = {
  primary: "bg-accent text-accent-ink hover:bg-accent-hover border border-transparent",
  secondary: "bg-surface text-ink border border-control hover:bg-sunken",
  ghost: "text-ink-2 border border-transparent hover:bg-sunken hover:text-ink",
  danger: "bg-surface text-bad border border-control hover:bg-bad-soft",
};
export function buttonClass(variant: Variant = "secondary", size: "sm" | "md" = "md", extra = "") {
  return cx(
    "inline-flex shrink-0 items-center justify-center gap-1.5 rounded-md font-medium whitespace-nowrap disabled:cursor-not-allowed disabled:opacity-50",
    size === "sm" ? "h-8 px-3 text-meta" : "h-9 px-4 text-meta",
    VARIANT[variant],
    extra,
  );
}

/* ─── Page structure ───────────────────────────────────────────────────────────────────────── */
export function PageHeader({ title, eyebrow, description, actions }: { title: ReactNode; eyebrow?: ReactNode; description?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="mb-8 flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
      <div className="min-w-0">
        {eyebrow && <p className="mb-1 text-meta text-ink-3">{eyebrow}</p>}
        <h1 className="text-page text-ink">{title}</h1>
        {description && <p className="mt-2 max-w-2xl text-body text-ink-2">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </header>
  );
}

export function Section({ title, aside, children, className = "" }: { title?: ReactNode; aside?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cx("py-7 first:pt-0", className)}>
      {(title || aside) && (
        <div className="mb-3 flex items-baseline justify-between gap-4">
          {title && <h2 className="text-heading text-ink">{title}</h2>}
          {aside && <div className="hidden text-meta text-ink-3 sm:block">{aside}</div>}
        </div>
      )}
      {children}
    </section>
  );
}

/** Native <details>: keyboard + screen-reader accessible, no JS. Content is one interaction away. */
export function DisclosureSection({
  title, summary, children, defaultOpen = false, quiet = false, className = "",
}: { title: ReactNode; summary?: ReactNode; children: ReactNode; defaultOpen?: boolean; quiet?: boolean; className?: string }) {
  return (
    <details open={defaultOpen} className={cx("disclosure group border-t border-line", className)}>
      <summary className="flex min-h-11 items-center gap-2 rounded-md py-3 text-ink">
        <ChevronRight className="chev shrink-0 text-ink-3 transition-transform duration-200" />
        <span className={cx("text-body", quiet ? "text-ink-2" : "font-medium")}>{title}</span>
        {summary && <span className="ml-auto pl-4 text-meta text-ink-3">{summary}</span>}
      </summary>
      <div className="pb-6 pl-6">{children}</div>
    </details>
  );
}

/** Label / value pairs as a calm definition grid. Empty values are dropped, never shown as “Unknown”. */
export function DetailGroup({ items, columns = 3 }: { items: [string, ReactNode][]; columns?: 2 | 3 }) {
  const rows = items.filter(([, v]) => v != null && v !== "" && v !== false);
  if (rows.length === 0) return null;
  return (
    <dl className={cx("grid gap-x-8 gap-y-4", columns === 3 ? "grid-cols-2 sm:grid-cols-3" : "grid-cols-1 sm:grid-cols-2")}>
      {rows.map(([k, v]) => (
        <div key={k} className="min-w-0">
          <dt className="text-label text-ink-3">{k}</dt>
          <dd className="mt-0.5 break-words text-body text-ink">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Compact inline statistics (page headers, summaries). Never a grid of giant cards. */
export function CompactStat({ value, label }: { value: ReactNode; label: string }) {
  return (
    <div className="flex items-baseline gap-1.5">
      <span className="text-body font-semibold tabular-nums text-ink">{value}</span>
      <span className="text-meta text-ink-3">{label}</span>
    </div>
  );
}

/* ─── Status ───────────────────────────────────────────────────────────────────────────────── */
const DOT: Record<Tone, string> = { neutral: "bg-ink-3", positive: "bg-ok", caution: "bg-warn", negative: "bg-bad", accent: "bg-accent" };
const TEXT: Record<Tone, string> = { neutral: "text-ink-2", positive: "text-ink", caution: "text-ink", negative: "text-bad", accent: "text-ink" };

/** Dot + words. Colour reinforces the text, never replaces it. */
export function StatusLabel({ label, title, muted = false }: { label: Label; title?: string; muted?: boolean }) {
  return (
    <span className={cx("inline-flex items-center gap-1.5 whitespace-nowrap text-meta", muted ? "text-ink-3" : TEXT[label.tone])} title={title}>
      <span className={cx("size-1.5 shrink-0 rounded-full", muted ? "bg-line-strong" : DOT[label.tone])} aria-hidden="true" />
      {label.text}
    </span>
  );
}

export function Callout({ tone = "caution", title, children, action }: { tone?: "caution" | "negative" | "info"; title?: ReactNode; children?: ReactNode; action?: ReactNode }) {
  const bg = tone === "negative" ? "bg-bad-soft" : tone === "info" ? "bg-accent-soft" : "bg-warn-soft";
  const fg = tone === "negative" ? "text-bad" : tone === "info" ? "text-accent" : "text-warn";
  return (
    <div role={tone === "negative" ? "alert" : "status"} className={cx("flex items-start gap-3 rounded-md px-4 py-3", bg)}>
      <AlertIcon className={cx("mt-0.5 shrink-0", fg)} />
      <div className="min-w-0 flex-1 text-meta text-ink">
        {title && <p className="font-medium">{title}</p>}
        {children && <div className={title ? "mt-0.5 text-ink-2" : undefined}>{children}</div>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

/* ─── Empty / loading ──────────────────────────────────────────────────────────────────────── */
export function EmptyState({ title, children, action, className = "" }: { title: string; children?: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={cx("rounded-lg border border-dashed border-line-strong px-6 py-12 text-center", className)}>
      <p className="text-heading text-ink">{title}</p>
      {children && <p className="mx-auto mt-1.5 max-w-md text-body text-ink-2">{children}</p>}
      {action && <div className="mt-5 flex justify-center">{action}</div>}
    </div>
  );
}

export const Skeleton = ({ className = "" }: { className?: string }) => <div className={cx("skeleton", className)} aria-hidden="true" />;

export function SetupNotice({ message }: { message: string }) {
  return (
    <Callout tone="caution" title="Setup required">
      {message}
    </Callout>
  );
}

export const Kbd = ({ children }: { children: ReactNode }) => (
  <kbd className="rounded border border-line-strong bg-sunken px-1.5 py-px font-sans text-label text-ink-3">{children}</kbd>
);

/** A raw machine code, shown only in technical disclosures. */
export const Code = ({ children }: { children: ReactNode }) => <code className="rounded bg-sunken px-1.5 py-0.5 font-mono text-label text-ink-2">{children}</code>;
