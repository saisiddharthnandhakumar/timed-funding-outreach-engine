import Link from "next/link";
import { BoltIcon, ArrowRight } from "@/components/icons";
import { ThemeToggle } from "@/components/theme-toggle";
import { buttonClass, CompactStat } from "@/components/ui";
import { configured, dashboardData } from "@/lib/queries";
import { timeAgo } from "@/lib/format";

export const dynamic = "force-dynamic";

const STEPS = [
  ["Discover", "Indian startup-news feeds are checked around the clock. Every article keeps when it was published and when we first saw it."],
  ["Classify", "Each candidate is read: is it a funding round, which company, which stage, how much, who invested."],
  ["Filter and merge", "Wrong stage, wrong country and stale news are dropped. Several articles about one raise become one funding event."],
  ["Research", "Only the survivors are researched: official site, founders, product, traction. What can’t be found stays unknown."],
  ["Score", "Each startup is scored against your editable thesis. The application, not the model, does the arithmetic."],
  ["Draft", "Strong fits get a personalised email grounded in the research. You review and send. Nothing goes out automatically."],
];

async function liveStats() {
  if (!configured()) return null;
  try {
    const d = await dashboardData();
    const last = d.runs[0] as { started_at?: string } | undefined;
    return { articles: d.articles, qualified: d.qualified, drafts: d.drafts, lastRun: last?.started_at ?? null };
  } catch {
    return null;
  }
}

export default async function Landing() {
  const stats = await liveStats();
  return (
    <div className="min-h-screen">
      <header className="mx-auto flex max-w-5xl items-center justify-between px-6 py-5">
        <span className="flex items-center gap-2.5 text-body font-semibold tracking-tight">
          <span className="grid size-7 place-items-center rounded-md bg-ink text-bg"><BoltIcon width={15} height={15} /></span>
          Funding Outreach
        </span>
        <nav className="flex items-center gap-2" aria-label="Site">
          <a href="#how" className="hidden rounded-md px-3 py-2 text-meta text-ink-2 hover:text-ink sm:block">How it works</a>
          <ThemeToggle />
          <Link href="/today" className={buttonClass("primary")}>Open Today</Link>
        </nav>
      </header>

      <main>
        <section className="mx-auto max-w-5xl px-6 pb-20 pt-16 sm:pt-24">
          <div className="rise max-w-2xl">
            <h1 className="text-[2.5rem] font-semibold leading-[1.1] tracking-[-0.03em] text-ink sm:text-[3.5rem]">Reach founders while the funding news is fresh.</h1>
            <p className="mt-6 max-w-xl text-[1.0625rem] leading-relaxed text-ink-2">
              The Timed Funding Outreach Engine watches Indian startup news, finds new pre-seed and seed rounds, checks them against your accelerator thesis, and leaves a personalised draft waiting for you.
            </p>
            <div className="mt-9 flex flex-wrap items-center gap-4">
              <Link href="/today" className={buttonClass("primary", "md", "h-11 px-6 text-body")}>Go to Today <ArrowRight /></Link>
              <a href="#how" className="text-meta font-medium text-ink-2 hover:text-ink">See how it works</a>
            </div>
            <p className="mt-6 text-meta text-ink-3">Drafts only. Nothing is sent without your confirmation.</p>
          </div>

          <div className="rise mt-16 max-w-2xl rounded-lg border border-line p-6 [animation-delay:120ms]">
            <p className="text-label text-ink-3">Illustrative example</p>
            <div className="mt-3 flex items-start justify-between gap-6">
              <div>
                <p className="text-name">Nimbus AI</p>
                <p className="text-meta text-ink-2">Seed · ₹18 Cr · 2h ago</p>
                <p className="text-meta text-ink-3">Vertical AI · Bengaluru</p>
              </div>
              <div className="text-right"><span className="text-label text-ink-3">Fit </span><span className="text-[1.375rem] font-semibold tabular-nums">87</span></div>
            </div>
            <p className="mt-3 text-body text-ink-2">AI procurement software for manufacturers.</p>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <div><p className="text-label text-ink-3">Why now</p><p className="text-body">Led by Accel. 22h left in your 24h window.</p></div>
              <div><p className="text-label text-ink-3">Recommended angle</p><p className="text-body">Strong vertical AI alignment; enterprise workflow product</p></div>
            </div>
          </div>
        </section>

        {stats && (
          <section className="mx-auto max-w-5xl px-6" aria-label="Live numbers">
            <div className="flex flex-wrap items-baseline gap-x-8 gap-y-2 border-y border-line py-4">
              <CompactStat value={stats.articles} label="articles seen in 24h" />
              <CompactStat value={stats.qualified} label="qualified" />
              <CompactStat value={stats.drafts} label="drafts" />
              {stats.lastRun && <span className="ml-auto text-meta text-ink-3">Last scan {timeAgo(stats.lastRun)}</span>}
            </div>
          </section>
        )}

        <section id="how" className="mx-auto max-w-5xl px-6 py-24">
          <h2 className="max-w-xl text-[1.75rem] font-semibold tracking-tight">From announcement to draft, automatically</h2>
          <p className="mt-3 max-w-xl text-body text-ink-2">Effort is spent only where it pays off: cheap checks first, research last.</p>
          <ol className="mt-12 grid gap-x-12 gap-y-10 sm:grid-cols-2">
            {STEPS.map(([title, body], i) => (
              <li key={title} className="flex gap-4">
                <span className="mt-0.5 w-6 shrink-0 text-meta tabular-nums text-ink-3">{String(i + 1).padStart(2, "0")}</span>
                <div>
                  <h3 className="text-heading">{title}</h3>
                  <p className="mt-1 text-body text-ink-2">{body}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>
      </main>

      <footer className="border-t border-line py-8 text-center text-meta text-ink-3">Timed Funding Outreach Engine</footer>
    </div>
  );
}
