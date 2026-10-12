import Link from "next/link";
import { CommandSearch } from "@/components/command-search";
import { BoltIcon } from "@/components/icons";
import { ShellProvider } from "@/components/shell";
import { MobileTabBar, Sidebar } from "@/components/sidebar";
import { SystemStatus } from "@/components/system-status";
import { ThemeToggle } from "@/components/theme-toggle";
import { getSystemSummary } from "@/lib/system";

export const dynamic = "force-dynamic";

/** App shell: collapsible sidebar (desktop), tab bar (phone), and a quiet top bar with search + system status. */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const system = await getSystemSummary();
  return (
    <ShellProvider initial={system}>
      <a href="#main" className="sr-only z-50 rounded-md bg-surface px-3 py-2 text-meta shadow-pop focus:not-sr-only focus:fixed focus:left-3 focus:top-3">Skip to content</a>
      <Sidebar />
      <div className="transition-[padding] duration-200 lg:pl-[var(--sidebar-w)]">
        <header className="sticky top-0 z-20 flex h-14 items-center gap-2 border-b border-line bg-bg/85 px-4 backdrop-blur sm:px-8">
          <Link href="/today" className="flex items-center gap-2 lg:hidden" aria-label="Funding Outreach, home">
            <span className="grid size-7 place-items-center rounded-md bg-ink text-bg"><BoltIcon width={15} height={15} /></span>
          </Link>
          <div className="ml-auto flex items-center gap-1.5">
            <CommandSearch />
            <SystemStatus />
            <span className="lg:hidden"><ThemeToggle /></span>
          </div>
        </header>
        <main id="main" className="mx-auto w-full max-w-5xl px-4 pb-28 pt-8 sm:px-8 lg:pb-20 lg:pt-12">{children}</main>
      </div>
      <MobileTabBar />
    </ShellProvider>
  );
}
