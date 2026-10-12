import type { ReactNode } from "react";

/** Label above value. Skips itself when there is nothing to show, rather than printing "Unknown". */
export function Field({ label, children }: { label: string; children?: ReactNode }) {
  if (children === null || children === undefined || children === "" || children === false) return null;
  return (
    <div>
      <dt className="text-xs font-medium text-faint">{label}</dt>
      <dd className="mt-0.5 text-[0.95rem] text-ink">{children}</dd>
    </div>
  );
}

export const FieldGrid = ({ children, cols = 3 }: { children: ReactNode; cols?: 2 | 3 }) => (
  <dl className={`grid gap-x-8 gap-y-5 ${cols === 3 ? "grid-cols-2 sm:grid-cols-3" : "grid-cols-1 sm:grid-cols-2"}`}>{children}</dl>
);

export function BulletList({ items }: { items: string[] }) {
  if (!items.length) return null;
  return (
    <ul className="space-y-1.5">
      {items.map((t, i) => (
        <li key={i} className="flex gap-2.5 text-[0.95rem] leading-snug text-ink">
          <span aria-hidden="true" className="mt-[0.55rem] h-1 w-1 shrink-0 rounded-full bg-faint" />
          <span>{t}</span>
        </li>
      ))}
    </ul>
  );
}
