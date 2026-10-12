import Link from "next/link";
import type { ReactNode } from "react";
import { ThemeToggle } from "../theme-toggle";
import { NavLinks } from "./nav-links";
import { SearchTrigger } from "./search-trigger";
import { ShellProvider } from "./shell-provider";
import { HealthNotice, SidebarHealth } from "./system-health";

function Wordmark() {
  return (
    <Link href="/today" className="flex items-center gap-2.5 text-[0.95rem] font-semibold tracking-tight text-ink">
      <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent text-on-accent" aria-hidden="true">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M13 2L4 14h7l-1 8 9-12h-7l1-8z" /></svg>
      </span>
      Funding Outreach
    </Link>
  );
}

/**
 * Four destinations, one calm frame. Desktop: left sidebar. Below 1024px: slim top bar + bottom tab bar.
 * Only one of the two navs is ever rendered into the accessibility tree (the other is display:none).
 */
export function AppShell({ children }: { children: ReactNode }) {
  return (
    <ShellProvider>
      <div className="app-body min-h-screen bg-canvas text-ink lg:grid lg:grid-cols-[15.5rem_minmax(0,1fr)]">
        <a href="#main" className="sr-only z-50 rounded-lg bg-surface px-4 py-2 text-sm font-medium focus:not-sr-only focus:fixed focus:left-4 focus:top-4">Skip to content</a>

        <aside className="hidden border-r border-line bg-surface lg:sticky lg:top-0 lg:flex lg:h-screen lg:flex-col lg:px-3 lg:py-5">
          <div className="px-3 pb-5"><Wordmark /></div>
          <nav aria-label="Primary"><NavLinks variant="side" /></nav>
          <div className="mt-auto space-y-1 border-t border-line pt-3">
            <SidebarHealth />
            <ThemeToggle withLabel className="w-full justify-start" />
          </div>
        </aside>

        <div className="min-w-0">
          <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-line bg-surface/95 px-4 backdrop-blur lg:hidden">
            <Wordmark />
            <div className="flex items-center gap-1">
              <SearchTrigger />
              <ThemeToggle />
            </div>
          </header>

          <main id="main" tabIndex={-1} className="mx-auto w-full max-w-5xl px-4 py-8 pb-28 outline-none sm:px-8 lg:px-12 lg:py-12 lg:pb-16">
            <HealthNotice />
            {children}
          </main>

          <nav aria-label="Primary, bottom bar" className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface pb-[env(safe-area-inset-bottom)] lg:hidden">
            <NavLinks variant="bottom" />
          </nav>
        </div>
      </div>
    </ShellProvider>
  );
}
