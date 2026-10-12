import type { SVGProps } from "react";

/** One consistent icon set: 20px grid, 1.6 stroke, round caps. Decorative by default (aria-hidden). */
function Svg({ children, ...p }: SVGProps<SVGSVGElement>) {
  return (
    <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...p}>
      {children}
    </svg>
  );
}
type P = SVGProps<SVGSVGElement>;

export const TodayIcon = (p: P) => <Svg {...p}><circle cx="10" cy="10" r="3.2" /><path d="M10 2.5v1.8M10 15.7v1.8M2.5 10h1.8M15.7 10h1.8M4.7 4.7l1.3 1.3M14 14l1.3 1.3M4.7 15.3 6 14M14 6l1.3-1.3" /></Svg>;
export const OpportunitiesIcon = (p: P) => <Svg {...p}><path d="M10 2.8l1.9 4.3 4.6.5-3.4 3.1 1 4.6L10 12.9l-4.1 2.4 1-4.6L3.5 7.6l4.6-.5L10 2.8z" /></Svg>;
export const DraftsIcon = (p: P) => <Svg {...p}><rect x="2.5" y="4.5" width="15" height="11" rx="2" /><path d="M3 6l7 5 7-5" /></Svg>;
export const DiscoveriesIcon = (p: P) => <Svg {...p}><circle cx="10" cy="10" r="7" /><path d="M12.8 7.2l-1.6 4-4 1.6 1.6-4 4-1.6z" /></Svg>;
export const SettingsIcon = (p: P) => <Svg {...p}><path d="M3 6h7M14 6h3M3 14h3M10 14h7" /><circle cx="12" cy="6" r="2" /><circle cx="8" cy="14" r="2" /></Svg>;
export const SearchIcon = (p: P) => <Svg {...p}><circle cx="9" cy="9" r="5.5" /><path d="M13.2 13.2L17 17" /></Svg>;
export const ChevronRight = (p: P) => <Svg width="14" height="14" {...p}><path d="M7.5 4.5L13 10l-5.5 5.5" /></Svg>;
export const ChevronDown = (p: P) => <Svg width="14" height="14" {...p}><path d="M4.5 7.5L10 13l5.5-5.5" /></Svg>;
export const ArrowRight = (p: P) => <Svg width="16" height="16" {...p}><path d="M4 10h12M11 5l5 5-5 5" /></Svg>;
export const ArrowLeft = (p: P) => <Svg width="16" height="16" {...p}><path d="M16 10H4M9 5l-5 5 5 5" /></Svg>;
export const CheckIcon = (p: P) => <Svg width="16" height="16" {...p}><path d="M4.5 10.5l3.5 3.5 7.5-8" /></Svg>;
export const CloseIcon = (p: P) => <Svg width="16" height="16" {...p}><path d="M5 5l10 10M15 5L5 15" /></Svg>;
export const MoreIcon = (p: P) => <Svg {...p}><circle cx="4.5" cy="10" r="1" fill="currentColor" /><circle cx="10" cy="10" r="1" fill="currentColor" /><circle cx="15.5" cy="10" r="1" fill="currentColor" /></Svg>;
export const ExternalIcon = (p: P) => <Svg width="14" height="14" {...p}><path d="M8 4H5a1.5 1.5 0 0 0-1.5 1.5v9A1.5 1.5 0 0 0 5 16h9a1.5 1.5 0 0 0 1.5-1.5V12M11 3.5h5.5V9M16.5 3.5L9 11" /></Svg>;
export const CopyIcon = (p: P) => <Svg width="16" height="16" {...p}><rect x="7" y="7" width="9" height="9" rx="1.8" /><path d="M13 7V5.5A1.5 1.5 0 0 0 11.5 4h-6A1.5 1.5 0 0 0 4 5.5v6A1.5 1.5 0 0 0 5.5 13H7" /></Svg>;
export const SidebarIcon = (p: P) => <Svg {...p}><rect x="3" y="4" width="14" height="12" rx="2" /><path d="M8 4v12" /></Svg>;
export const SunIcon = (p: P) => <Svg {...p}><circle cx="10" cy="10" r="3.3" /><path d="M10 2.8v1.4M10 15.8v1.4M2.8 10h1.4M15.8 10h1.4M4.9 4.9l1 1M14.1 14.1l1 1M4.9 15.1l1-1M14.1 5.9l1-1" /></Svg>;
export const MoonIcon = (p: P) => <Svg {...p}><path d="M16.5 11.6A6.8 6.8 0 1 1 8.4 3.5a5.4 5.4 0 0 0 8.1 8.1z" /></Svg>;
export const AlertIcon = (p: P) => <Svg {...p}><path d="M10 3.2l7.2 12.6H2.8L10 3.2z" /><path d="M10 8.3v3.3M10 13.6v.1" /></Svg>;
export const BoltIcon = (p: P) => <Svg strokeWidth="1.9" {...p}><path d="M11.2 2.5L4.5 11h4.8l-.5 6.5L15.5 9h-4.8l.5-6.5z" /></Svg>;
export const PulseIcon = (p: P) => <Svg {...p}><path d="M2.5 10h3.2l2-5.5 3.6 11 2-5.5h4.2" /></Svg>;
export const EditIcon = (p: P) => <Svg width="16" height="16" {...p}><path d="M12.8 4.2l3 3L7 16H4v-3l8.8-8.8z" /></Svg>;
export const SendIcon = (p: P) => <Svg width="16" height="16" {...p}><path d="M17 3L8.5 11.5M17 3l-5.3 14-3.2-5.5L3 8.3 17 3z" /></Svg>;
