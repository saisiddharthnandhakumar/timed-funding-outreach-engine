"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useShell } from "./shell-provider";

export const NAV = [
  { href: "/today", label: "Today", match: ["/today"], icon: "M12 3v2M12 19v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M3 12h2M19 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z" },
  { href: "/opportunities", label: "Opportunities", match: ["/opportunities"], icon: "M4 6h16M4 12h16M4 18h10" },
  { href: "/drafts", label: "Drafts", match: ["/drafts"], icon: "M4 6l8 6 8-6M4 6v12h16V6M4 6h16" },
  { href: "/settings", label: "Settings", match: ["/settings"], icon: "M4 7h10M18 7h2M4 17h2M10 17h10M14 4v6M8 14v6" },
] as const;

const isActive = (path: string, match: readonly string[]) => match.some((m) => path === m || path.startsWith(`${m}/`));

function Icon({ d }: { d: string }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={d} />
    </svg>
  );
}

/** The four destinations. `side` is the desktop sidebar list, `bottom` is the mobile tab bar. */
export function NavLinks({ variant }: { variant: "side" | "bottom" }) {
  const path = usePathname();
  const { snapshot } = useShell();
  const drafts = snapshot?.draftsReady ?? 0;

  return (
    <ul className={variant === "side" ? "space-y-0.5" : "grid grid-cols-4"}>
      {NAV.map((n) => {
        const active = isActive(path, n.match);
        const badge = n.href === "/drafts" && drafts > 0;
        return (
          <li key={n.href}>
            <Link
              href={n.href}
              aria-current={active ? "page" : undefined}
              className={
                variant === "side"
                  ? `flex h-10 items-center gap-3 rounded-lg px-3 text-sm font-medium ${active ? "bg-accent-soft text-accent" : "text-muted hover:bg-sunken hover:text-ink"}`
                  : `flex h-14 flex-col items-center justify-center gap-0.5 text-xs font-medium ${active ? "text-accent" : "text-muted"}`
              }
            >
              <span className="relative">
                <Icon d={n.icon} />
                {badge && variant === "bottom" && <span className="num absolute -right-2.5 -top-1.5 min-w-4 rounded-full bg-accent px-1 text-center text-[10px] font-semibold leading-4 text-on-accent">{drafts}</span>}
              </span>
              <span>{n.label}</span>
              {badge && variant === "side" && (
                <span className="num ml-auto rounded-full bg-accent px-2 py-0.5 text-xs font-semibold text-on-accent">
                  {drafts}
                  <span className="sr-only"> drafts ready</span>
                </span>
              )}
              {badge && variant === "bottom" && <span className="sr-only">{drafts} drafts ready</span>}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
