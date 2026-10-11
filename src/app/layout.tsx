import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Timed Funding Outreach Engine",
  description: "Automated Indian pre-seed/seed funding discovery, thesis scoring and human-reviewed outreach drafts.",
};

const NAV = [
  ["/", "Dashboard"],
  ["/feed", "Funding Feed"],
  ["/qualified", "Qualified"],
  ["/drafts", "Drafts"],
  ["/settings", "Thesis Settings"],
  ["/sources", "Sources"],
] as const;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable}`}>
      <body className="min-h-screen antialiased">
        <header className="border-b border-slate-200 bg-white">
          <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-8 gap-y-2 px-6 py-3">
            <Link href="/" className="text-sm font-semibold tracking-tight text-slate-900">Funding Outreach Engine</Link>
            <nav className="flex flex-wrap gap-1 text-sm">
              {NAV.map(([href, label]) => (
                <Link key={href} href={href} className="rounded-md px-3 py-1.5 text-slate-600 hover:bg-slate-100 hover:text-slate-900">{label}</Link>
              ))}
            </nav>
          </div>
        </header>
        <main className="mx-auto max-w-7xl px-6 py-8">{children}</main>
      </body>
    </html>
  );
}
