import { Skeleton } from "@/components/ui";

export default function Loading() {
  return (
    <div aria-busy="true" aria-label="Loading today’s briefing">
      <div className="mb-10 space-y-3">
        <Skeleton className="h-3.5 w-32" />
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-4 w-80 max-w-full" />
      </div>
      <div className="divide-y divide-line border-y border-line">
        {[0, 1, 2].map((i) => (
          <div key={i} className="space-y-3 py-6">
            <div className="flex justify-between"><Skeleton className="h-6 w-48" /><Skeleton className="h-9 w-14" /></div>
            <Skeleton className="h-3.5 w-64" />
            <Skeleton className="h-4 w-full max-w-xl" />
            <div className="grid gap-4 pt-1 sm:grid-cols-2"><Skeleton className="h-10" /><Skeleton className="h-10" /></div>
          </div>
        ))}
      </div>
    </div>
  );
}
