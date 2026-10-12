import { CardListSkeleton, Skeleton } from "@/components/loading-state";

export default function Loading() {
  return (
    <>
      <div className="mb-10 space-y-3" aria-hidden="true">
        <Skeleton className="h-10 w-72" />
        <Skeleton className="h-6 w-80 max-w-full" />
        <Skeleton className="h-4 w-56" />
      </div>
      <CardListSkeleton rows={3} />
    </>
  );
}
