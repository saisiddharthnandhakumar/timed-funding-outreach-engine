import { Skeleton } from "@/components/ui";

export default function Loading() {
  return (
    <div aria-busy="true" aria-label="Loading discoveries">
      <div className="mb-8 space-y-3"><Skeleton className="h-8 w-48" /><Skeleton className="h-4 w-96 max-w-full" /></div>
      <div className="divide-y divide-line border-y border-line">
        {[0, 1, 2, 3, 4].map((i) => <div key={i} className="space-y-2 py-5"><Skeleton className="h-5 w-44" /><Skeleton className="h-3.5 w-60" /></div>)}
      </div>
    </div>
  );
}
