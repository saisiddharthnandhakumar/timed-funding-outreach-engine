import type { ComponentType, SVGProps } from "react";
import { DiscoveriesIcon, DraftsIcon, OpportunitiesIcon, SettingsIcon, TodayIcon } from "./icons";

export interface NavItem {
  href: string;
  label: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  /** Key into the shell badges, e.g. the number of drafts waiting for review. */
  badge?: "drafts";
}

/** Grouped by how the scout works: the daily loop, the wider feed, then configuration. */
export const NAV_GROUPS: NavItem[][] = [
  [
    { href: "/today", label: "Today", icon: TodayIcon },
    { href: "/opportunities", label: "Opportunities", icon: OpportunitiesIcon },
    { href: "/drafts", label: "Drafts", icon: DraftsIcon, badge: "drafts" },
  ],
  [{ href: "/discoveries", label: "Discoveries", icon: DiscoveriesIcon }],
  [{ href: "/settings", label: "Settings", icon: SettingsIcon }],
];

export const NAV_ITEMS = NAV_GROUPS.flat();

export const isActive = (pathname: string, href: string) => pathname === href || pathname.startsWith(`${href}/`);
