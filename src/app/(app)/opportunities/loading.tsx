import { OpportunityRowSkeleton } from "@/components/opportunity";
import { Skeleton } from "@/components/ui";

export default function Loading() {
  return (
    <div aria-busy="true" aria-label="Loading opportunities">
      <div className="mb-8 space-y-3"><Skeleton className="h-8 w-48" /><Skeleton className="h-4 w-72" /></div>
      <Skeleton className="mb-6 h-9 w-80 max-w-full" />
      <ul className="divide-y divide-line border-y border-line">{[0, 1, 2, 3, 4, 5].map((i) => <OpportunityRowSkeleton key={i} />)}</ul>
    </div>
  );
}
