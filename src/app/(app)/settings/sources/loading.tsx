import { Skeleton } from "@/components/loading-state";

export default function Loading() {
  return (
    <div className="space-y-6" aria-hidden="true">
      <Skeleton className="h-5 w-80 max-w-full" />
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <Skeleton key={i} className="h-10 w-full" />
      ))}
    </div>
  );
}
