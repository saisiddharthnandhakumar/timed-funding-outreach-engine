import Link from "next/link";
import type { ReactNode } from "react";

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">{title}</h1>
        {subtitle && <p className="mt-1 max-w-3xl text-sm text-slate-500">{subtitle}</p>}
      </div>
      {actions}
    </div>
  );
}

export function Card({ title, children, className = "" }: { title?: string; children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-xl border border-slate-200 bg-white shadow-sm ${className}`}>
      {title && <h2 className="border-b border-slate-100 px-5 py-3 text-sm font-semibold text-slate-800">{title}</h2>}
      <div className="p-5">{children}</div>
    </section>
  );
}

export function Stat({ label, value, hint }: { label: string; value: ReactNode; hint?: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-1 text-2xl font-semibold text-slate-900">{value}</div>
      {hint && <div className="mt-1 text-xs text-slate-400">{hint}</div>}
    </div>
  );
}

const TONES: Record<string, string> = {
  green: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  red: "bg-rose-50 text-rose-700 ring-rose-600/20",
  amber: "bg-amber-50 text-amber-700 ring-amber-600/20",
  blue: "bg-sky-50 text-sky-700 ring-sky-600/20",
  indigo: "bg-indigo-50 text-indigo-700 ring-indigo-600/20",
  slate: "bg-slate-100 text-slate-600 ring-slate-500/20",
};

export function Badge({ children, tone = "slate" }: { children: ReactNode; tone?: keyof typeof TONES }) {
  return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${TONES[tone]}`}>{children}</span>;
}

const STATUS_TONE: Record<string, keyof typeof TONES> = {
  discovered: "blue", enriching: "blue", scored: "indigo", qualified: "green", drafted: "green", rejected: "red", error: "amber",
  generated: "indigo", draft_created: "green", approved: "green", sent: "slate", cancelled: "slate",
  completed: "green", partial: "amber", failed: "red", skipped: "slate",
  publicly_confirmed: "green", provider_verified: "green", domain_valid_only: "amber", pattern_guessed: "amber", unverified: "slate", not_found: "slate", in_progress: "blue", running: "blue", pending: "slate", duplicate: "slate", processed: "green",
};

export function StatusBadge({ status }: { status: string | null | undefined }) {
  if (!status) return <span className="text-slate-400">—</span>;
  return <Badge tone={STATUS_TONE[status] ?? "slate"}>{status.replace(/_/g, " ")}</Badge>;
}

export function ScorePill({ score }: { score: number | null | undefined }) {
  if (score == null) return <span className="text-slate-400">—</span>;
  const tone = score >= 80 ? "green" : score >= 70 ? "indigo" : "red";
  return <Badge tone={tone}>{score}</Badge>;
}

export function Table({ head, children, empty }: { head: string[]; children: ReactNode; empty?: string }) {
  const rows = Array.isArray(children) ? children.length : children ? 1 : 0;
  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
      <table className="min-w-full divide-y divide-slate-100 text-sm">
        <thead className="bg-slate-50 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
          <tr>{head.map((h) => <th key={h} className="whitespace-nowrap px-4 py-3">{h}</th>)}</tr>
        </thead>
        <tbody className="divide-y divide-slate-100 align-top">{children}</tbody>
      </table>
      {rows === 0 && <p className="px-4 py-8 text-center text-sm text-slate-400">{empty ?? "Nothing here yet."}</p>}
    </div>
  );
}

export const Td = ({ children, className = "" }: { children?: ReactNode; className?: string }) => <td className={`px-4 py-3 ${className}`}>{children}</td>;

export function StartupLink({ id, name }: { id: string; name: string }) {
  return <Link href={`/startups/${id}`} className="font-medium text-indigo-700 hover:underline">{name}</Link>;
}

export function SetupNotice({ message }: { message: string }) {
  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">
      <div className="font-semibold">Setup required</div>
      <p className="mt-1">{message}</p>
    </div>
  );
}
