import { HeaderSkeleton, RowListSkeleton } from "@/components/loading-state";

export default function Loading() {
  return (
    <>
      <HeaderSkeleton />
      <RowListSkeleton rows={4} />
    </>
  );
}
