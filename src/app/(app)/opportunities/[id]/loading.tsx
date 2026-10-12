import { Skeleton } from "@/components/loading-state";

export default function Loading() {
  return (
    <div role="status" aria-label="Loading" className="space-y-8">
      <Skeleton className="h-4 w-28" />
      <div className="space-y-3"><Skeleton className="h-10 w-72" /><Skeleton className="h-5 w-96 max-w-full" /><Skeleton className="h-4 w-64" /></div>
      <Skeleton className="h-20" />
      <Skeleton className="h-32" />
      <span className="sr-only">Loading…</span>
    </div>
  );
}
