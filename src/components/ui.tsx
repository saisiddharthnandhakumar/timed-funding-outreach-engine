import Link from "next/link";
import type { ReactNode } from "react";

/** Button class recipes. One accent; at most one `primary` per screen. */
const BASE = "inline-flex min-h-10 items-center justify-center gap-2 rounded-lg px-4 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50";
export const btn = {
  primary: `${BASE} bg-accent text-on-accent hover:bg-accent-hover`,
  secondary: `${BASE} border border-field bg-surface text-ink hover:bg-sunken`,
  ghost: `${BASE} px-3 text-muted hover:bg-sunken hover:text-ink`,
  danger: `${BASE} border border-bad/50 bg-surface text-bad hover:bg-bad-soft`,
} as const;

export const field = "w-full rounded-lg border border-field bg-surface px-3 py-2 text-sm text-ink placeholder:text-faint";

export function PageHeader({ title, subtitle, actions, eyebrow }: { title: string; subtitle?: ReactNode; actions?: ReactNode; eyebrow?: ReactNode }) {
  return (
    <header className="mb-8 flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
      <div className="min-w-0">
        {eyebrow && <div className="mb-1 text-sm text-faint">{eyebrow}</div>}
        <h1 className="text-2xl font-semibold tracking-tight text-ink sm:text-[1.7rem]">{title}</h1>
        {subtitle && <p className="mt-1.5 max-w-2xl text-[0.95rem] leading-relaxed text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-3">{actions}</div>}
    </header>
  );
}

/** A titled block separated by whitespace and a hairline, not a card. */
export function Section({ title, hint, actions, children, id, className = "" }: { title?: ReactNode; hint?: ReactNode; actions?: ReactNode; children: ReactNode; id?: string; className?: string }) {
  return (
    <section id={id} className={`border-t border-line pt-6 first:border-t-0 first:pt-0 ${className}`} aria-labelledby={id ? `${id}-h` : undefined}>
      {(title || actions) && (
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <div>
            {title && <h2 id={id ? `${id}-h` : undefined} className="text-base font-semibold text-ink">{title}</h2>}
            {hint && <p className="mt-0.5 text-sm text-faint">{hint}</p>}
          </div>
          {actions}
        </div>
      )}
      {children}
    </section>
  );
}

/** Reserved for content that is genuinely one unit (an opportunity on Today, the email itself). */
export function Card({ children, className = "", as: Tag = "div" }: { children: ReactNode; className?: string; as?: "div" | "article" | "section" }) {
  return <Tag className={`rounded-xl border border-line bg-surface ${className}`}>{children}</Tag>;
}

export type Tone = "neutral" | "ok" | "warn" | "bad" | "accent";
const TONE_TEXT: Record<Tone, string> = { neutral: "text-muted", ok: "text-ok", warn: "text-warn", bad: "text-bad", accent: "text-accent" };

/** Status as a word with a shape, never colour alone. */
export function StatusChip({ tone = "neutral", children }: { tone?: Tone; children: ReactNode }) {
  const icon =
    tone === "ok" ? <path d="M3.5 8.5l3 3 6-7" /> : tone === "warn" ? <path d="M8 4v5M8 12v.01" /> : tone === "bad" ? <path d="M4.5 4.5l7 7M11.5 4.5l-7 7" /> : tone === "accent" ? <circle cx="8" cy="8" r="2.6" fill="currentColor" stroke="none" /> : <circle cx="8" cy="8" r="2.2" />;
  return (
    <span className={`inline-flex items-center gap-1.5 text-sm font-medium ${TONE_TEXT[tone]}`}>
      <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{icon}</svg>
      {children}
    </span>
  );
}

/** Quiet neutral label for secondary facts (sector, source names). */
export function Tag({ children }: { children: ReactNode }) {
  return <span className="inline-flex items-center rounded-md bg-sunken px-2 py-0.5 text-xs font-medium text-muted">{children}</span>;
}

export function Table({ head, children, empty }: { head: string[]; children: ReactNode; empty?: string }) {
  const rows = Array.isArray(children) ? children.length : children ? 1 : 0;
  return (
    <div className="overflow-x-auto rounded-xl border border-line bg-surface">
      <table className="min-w-full text-sm">
        <thead className="border-b border-line text-left text-xs font-medium text-faint">
          <tr>{head.map((h) => <th key={h} scope="col" className="whitespace-nowrap px-4 py-2.5">{h}</th>)}</tr>
        </thead>
        <tbody className="divide-y divide-line align-top">{children}</tbody>
      </table>
      {rows === 0 && <p className="px-4 py-8 text-center text-sm text-faint">{empty ?? "Nothing here yet."}</p>}
    </div>
  );
}

export const Td = ({ children, className = "" }: { children?: ReactNode; className?: string }) => <td className={`px-4 py-3 ${className}`}>{children}</td>;

export function TextLink({ href, children, external = false }: { href: string; children: ReactNode; external?: boolean }) {
  const cls = "font-medium text-accent underline-offset-2 hover:underline";
  return external ? (
    <a href={href} target="_blank" rel="noreferrer" className={cls}>{children}<span className="sr-only"> (opens in a new tab)</span></a>
  ) : (
    <Link href={href} className={cls}>{children}</Link>
  );
}

export function SetupNotice({ message }: { message: string }) {
  return (
    <div role="status" className="rounded-xl border border-warn/40 bg-warn-soft p-5 text-sm text-ink">
      <div className="font-semibold">Setup required</div>
      <p className="mt-1 text-muted">{message}</p>
    </div>
  );
}

/** Dot-separated metadata line: "Seed · ₹18 Cr · Bengaluru · 2h ago". Skips empty parts. */
export function MetaLine({ parts, className = "" }: { parts: (ReactNode | null | undefined | false)[]; className?: string }) {
  const shown = parts.filter((p) => p !== null && p !== undefined && p !== false && p !== "");
  return (
    <p className={`text-sm text-muted ${className}`}>
      {shown.map((p, i) => (
        <span key={i}>
          {i > 0 && <span aria-hidden="true" className="px-1.5 text-faint">·</span>}
          {p}
        </span>
      ))}
    </p>
  );
}
