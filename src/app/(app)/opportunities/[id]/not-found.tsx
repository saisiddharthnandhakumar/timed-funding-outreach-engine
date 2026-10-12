import Link from "next/link";
import { EmptyState } from "@/components/empty-state";
import { btn } from "@/components/ui";

export default function NotFound() {
  return (
    <EmptyState title="We couldn’t find that startup" action={<Link href="/opportunities" className={btn.secondary}>Back to opportunities</Link>}>
      <p>It may have been removed, or the link is out of date.</p>
    </EmptyState>
  );
}
