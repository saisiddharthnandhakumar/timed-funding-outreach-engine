import Link from "next/link";
import { ThemeToggle } from "@/components/theme-toggle";

const NAV = [
  ["/dashboard", "Dashboard"],
  ["/feed", "Funding Feed"],
  ["/qualified", "Qualified"],
  ["/drafts", "Drafts"],
  ["/settings", "Thesis Settings"],
  ["/sources", "Sources"],
] as const;

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-8 gap-y-2 px-6 py-3">
          <Link href="/" className="text-sm font-semibold tracking-tight text-slate-900">Funding Outreach Engine</Link>
          <nav className="flex flex-1 flex-wrap gap-1 text-sm">
            {NAV.map(([href, label]) => (
              <Link key={href} href={href} className="rounded-md px-3 py-1.5 text-slate-600 hover:bg-slate-100 hover:text-slate-900">{label}</Link>
            ))}
          </nav>
          <ThemeToggle />
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-6 py-8">{children}</main>
    </>
  );
}
