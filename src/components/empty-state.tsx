import type { ReactNode } from "react";

/** An intentional empty state: say what is true, then what to do (if anything). Never "No data". */
export function EmptyState({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-line px-6 py-12 text-center sm:py-16">
      <h2 className="text-lg font-semibold text-ink">{title}</h2>
      {children && <div className="mx-auto mt-2 max-w-md space-y-1 text-[0.95rem] leading-relaxed text-muted">{children}</div>}
      {action && <div className="mt-5 flex justify-center">{action}</div>}
    </div>
  );
}
