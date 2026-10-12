"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cx } from "./ui";

const TABS = [
  { href: "/settings", label: "Investment thesis", exact: true },
  { href: "/settings/discovery", label: "Discovery" },
  { href: "/settings/integrations", label: "Integrations" },
  { href: "/settings/system", label: "System" },
];

export function SettingsNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Settings" className="-mx-4 mb-8 overflow-x-auto border-b border-line px-4 sm:-mx-8 sm:px-8">
      <ul className="flex gap-6">
        {TABS.map((t) => {
          const active = t.exact ? pathname === t.href : pathname.startsWith(t.href);
          return (
            <li key={t.href}>
              <Link href={t.href} aria-current={active ? "page" : undefined} className={cx("relative inline-flex h-11 items-center whitespace-nowrap text-body", active ? "font-medium text-ink after:absolute after:inset-x-0 after:-bottom-px after:h-0.5 after:bg-accent" : "text-ink-2 hover:text-ink")}>
                {t.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
