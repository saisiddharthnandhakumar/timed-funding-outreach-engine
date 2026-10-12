/** Calm skeletons that match the real layout, so nothing jumps when data arrives. */
export const Skeleton = ({ className = "" }: { className?: string }) => <div className={`skeleton ${className}`} aria-hidden="true" />;

export function HeaderSkeleton() {
  return (
    <div className="mb-8 space-y-3" aria-hidden="true">
      <Skeleton className="h-8 w-56" />
      <Skeleton className="h-4 w-80 max-w-full" />
    </div>
  );
}

export function CardListSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div role="status" aria-label="Loading" className="space-y-4">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="space-y-3 rounded-xl border border-line p-6">
          <div className="flex justify-between"><Skeleton className="h-5 w-40" /><Skeleton className="h-5 w-14" /></div>
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-4 w-1/2" />
          <div className="grid gap-3 pt-2 sm:grid-cols-2"><Skeleton className="h-12" /><Skeleton className="h-12" /></div>
        </div>
      ))}
      <span className="sr-only">Loading…</span>
    </div>
  );
}

export function RowListSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div role="status" aria-label="Loading" className="divide-y divide-line">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="space-y-2.5 py-5">
          <div className="flex justify-between"><Skeleton className="h-5 w-44" /><Skeleton className="h-5 w-12" /></div>
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="h-4 w-1/3" />
        </div>
      ))}
      <span className="sr-only">Loading…</span>
    </div>
  );
}
