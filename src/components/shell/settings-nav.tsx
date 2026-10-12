"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const SECTIONS = [
  { href: "/settings", label: "Investment Thesis" },
  { href: "/settings/sources", label: "Sources" },
  { href: "/settings/integrations", label: "Integrations" },
  { href: "/settings/system", label: "System" },
] as const;

export function SettingsNav() {
  const path = usePathname();
  return (
    <nav aria-label="Settings sections" className="-mx-4 mb-8 overflow-x-auto border-b border-line px-4 sm:mx-0 sm:px-0">
      <ul className="flex min-w-max gap-6">
        {SECTIONS.map((s) => {
          const active = s.href === "/settings" ? path === "/settings" : path === s.href || path.startsWith(`${s.href}/`);
          return (
            <li key={s.href}>
              <Link href={s.href} aria-current={active ? "page" : undefined} className={`-mb-px flex min-h-11 items-center border-b-2 px-1 pb-3 pt-1 text-sm font-medium focus-visible:outline-offset-[-2px] ${active ? "border-accent text-ink" : "border-transparent text-muted hover:text-ink"}`}>
                {s.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
