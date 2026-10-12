import Link from "next/link";
import { cx } from "./ui";

/** Server-rendered segmented control: plain links, so it works without JS and the state lives in the URL. */
export function SegmentedControl<T extends string>({
  label, options, current, hrefFor,
}: { label: string; options: { value: T; label: string; count?: number }[]; current: T; hrefFor: (value: T) => string }) {
  return (
    <nav aria-label={label}>
      <ul className="inline-flex rounded-md bg-sunken p-0.5">
        {options.map((o) => {
          const active = o.value === current;
          return (
            <li key={o.value}>
              <Link
                href={hrefFor(o.value)}
                aria-current={active ? "true" : undefined}
                scroll={false}
                className={cx("inline-flex h-8 items-center gap-1.5 rounded-[7px] px-3 text-meta", active ? "bg-surface font-medium text-ink shadow-[0_0_0_1px_var(--line),0_1px_2px_rgb(0_0_0/0.04)]" : "text-ink-2 hover:text-ink")}
              >
                {o.label}
                {o.count != null && <span className={cx("tabular-nums", active ? "text-ink-3" : "text-ink-3/80")}>{o.count}</span>}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
