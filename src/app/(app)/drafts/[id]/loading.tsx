import { Skeleton } from "@/components/loading-state";

export default function Loading() {
  return (
    <div role="status" aria-label="Loading" className="space-y-6">
      <Skeleton className="h-4 w-20" />
      <Skeleton className="h-9 w-64" />
      <Skeleton className="h-72" />
      <span className="sr-only">Loading…</span>
    </div>
  );
}
