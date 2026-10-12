import type { ReactNode } from "react";

/**
 * Progressive-disclosure primitive on native <details>: keyboard accessible, works without JavaScript.
 * The summary text says what it opens. `tone="technical"` mutes it for Level 3 content.
 * Pass `open` + `onOpenChange` from a client parent to control it (e.g. to reveal a validation error).
 */
export function DisclosureSection({
  title, hint, children, defaultOpen = false, tone = "default", open, onOpenChange, id,
}: {
  title: ReactNode;
  hint?: ReactNode;
  children: ReactNode;
  defaultOpen?: boolean;
  tone?: "default" | "technical";
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  id?: string;
}) {
  const controlled = open !== undefined;
  return (
    <details
      id={id}
      className={`group border-t border-line py-1 ${tone === "technical" ? "text-sm" : ""}`}
      {...(controlled ? { open } : { open: defaultOpen })}
      onToggle={onOpenChange ? (e) => onOpenChange((e.currentTarget as HTMLDetailsElement).open) : undefined}
    >
      <summary className="flex min-h-12 cursor-pointer items-center justify-between gap-3 rounded-md py-3 hover:text-ink">
        <span className="min-w-0">
          <span className={`font-medium ${tone === "technical" ? "text-muted" : "text-ink"}`}>{title}</span>
          {hint && <span className="ml-2 text-sm font-normal text-faint">{hint}</span>}
        </span>
        <svg className="shrink-0 text-faint transition-transform group-open:rotate-180" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M6 9l6 6 6-6" />
        </svg>
      </summary>
      <div className="disclosure-body pb-5 pt-1">{children}</div>
    </details>
  );
}
