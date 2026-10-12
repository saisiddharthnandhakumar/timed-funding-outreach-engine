"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BoltIcon, SidebarIcon } from "./icons";
import { NAV_GROUPS, isActive } from "./nav";
import { useShell } from "./shell";
import { ThemeToggle } from "./theme-toggle";
import { cx } from "./ui";

function toggleCollapsed() {
  const el = document.documentElement;
  const next = el.getAttribute("data-sidebar") !== "collapsed";
  if (next) el.setAttribute("data-sidebar", "collapsed");
  else el.removeAttribute("data-sidebar");
  try {
    localStorage.setItem("sidebar", next ? "collapsed" : "expanded");
  } catch {
    /* not persisted */
  }
}

/**
 * Desktop navigation. Collapse state lives on <html data-sidebar> (set before paint by the root layout),
 * so the collapsed layout is pure CSS (`sb-collapsed:` variant) and never flashes on load.
 */
export function Sidebar() {
  const pathname = usePathname();
  const badges = { drafts: useShell().summary.draftsToReview };
  return (
    <aside
      aria-label="Primary"
      className="fixed inset-y-0 left-0 z-30 hidden w-[var(--sidebar-w)] flex-col border-r border-line bg-sunken transition-[width] duration-200 lg:flex"
    >
      <div className="flex h-14 items-center gap-2.5 px-4 sb-collapsed:justify-center sb-collapsed:px-0">
        <span className="grid size-7 shrink-0 place-items-center rounded-md bg-ink text-bg"><BoltIcon width={15} height={15} /></span>
        <span className="truncate text-body font-semibold tracking-tight sb-collapsed:hidden">Funding Outreach</span>
      </div>

      <nav className="flex-1 overflow-y-auto px-2.5 py-2">
        {NAV_GROUPS.map((group, gi) => (
          <ul key={gi} className={cx("space-y-0.5", gi > 0 && "mt-5 border-t border-line pt-5")}>
            {group.map((item) => {
              const active = isActive(pathname, item.href);
              const count = item.badge ? badges[item.badge] : 0;
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    aria-label={count ? `${item.label}, ${count} to review` : item.label}
                    title={item.label}
                    className={cx(
                      "group relative flex h-9 items-center gap-2.5 rounded-md px-2.5 text-body sb-collapsed:justify-center",
                      active ? "bg-surface font-medium text-ink shadow-[0_0_0_1px_var(--line)]" : "text-ink-2 hover:bg-line/60 hover:text-ink",
                    )}
                  >
                    <item.icon className={cx("shrink-0", active && "text-accent")} />
                    <span className="truncate sb-collapsed:hidden">{item.label}</span>
                    {count > 0 && (
                      <span className="ml-auto rounded-full bg-accent-soft px-1.5 text-label font-semibold tabular-nums text-accent sb-collapsed:absolute sb-collapsed:right-1 sb-collapsed:top-1 sb-collapsed:ml-0 sb-collapsed:px-1 sb-collapsed:text-[10px] sb-collapsed:leading-4">{count}</span>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        ))}
      </nav>

      <div className="flex items-center justify-between gap-1 border-t border-line px-2.5 py-2.5 sb-collapsed:flex-col">
        <ThemeToggle label />
        <button
          type="button"
          onClick={toggleCollapsed}
          aria-label="Collapse or expand sidebar"
          title="Collapse or expand sidebar"
          className="grid size-9 place-items-center rounded-md text-ink-2 hover:bg-line/60 hover:text-ink"
        >
          <SidebarIcon />
        </button>
      </div>
    </aside>
  );
}

/** Phones: the same five destinations as a bottom tab bar (thumb reach). */
export function MobileTabBar() {
  const pathname = usePathname();
  const badges = { drafts: useShell().summary.draftsToReview };
  return (
    <nav aria-label="Primary" className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden">
      <ul className="mx-auto grid max-w-md grid-cols-5">
        {NAV_GROUPS.flat().map((item) => {
          const active = isActive(pathname, item.href);
          const count = item.badge ? badges[item.badge] : 0;
          return (
            <li key={item.href}>
              <Link href={item.href} aria-current={active ? "page" : undefined} className={cx("relative flex h-14 flex-col items-center justify-center gap-0.5 text-label", active ? "text-accent" : "text-ink-3")}>
                <item.icon width={20} height={20} />
                {item.label}
                {count > 0 && <span className="absolute right-[22%] top-1.5 rounded-full bg-accent px-1 text-[10px] font-semibold leading-4 text-accent-ink">{count}</span>}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
