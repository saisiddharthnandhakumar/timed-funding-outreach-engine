import Link from "next/link";
import { EmptyState } from "@/components/empty-state";
import { btn } from "@/components/ui";

export default function NotFound() {
  return (
    <EmptyState title="We couldn’t find that draft" action={<Link href="/drafts" className={btn.secondary}>Back to drafts</Link>}>
      <p>It may have been removed, or the link is out of date.</p>
    </EmptyState>
  );
}
