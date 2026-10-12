import Link from "next/link";
import { ThemeToggle } from "@/components/theme-toggle";
import { configured, landingStats } from "@/lib/queries";
import { timeAgo } from "@/lib/format";

export const dynamic = "force-dynamic";

const STEPS = [
  { n: "01", title: "Discover", body: "Four Indian startup-news feeds are polled around the clock. Every article keeps its published and first-seen timestamps." },
  { n: "02", title: "Classify", body: "Gemini Flash reads each candidate: is it a funding round, which company, India, which stage, how much, who invested." },
  { n: "03", title: "Filter & dedupe", body: "Hard rules drop wrong stage, wrong country and stale news. Four articles about one raise collapse into one funding event." },
  { n: "04", title: "Research", body: "Only survivors are researched: official site, founders, product, traction. Unknown stays unknown, never invented." },
  { n: "05", title: "Score", body: "The startup is scored against your editable thesis. The application, not the model, does the arithmetic." },
  { n: "06", title: "Draft", body: "Qualified startups get a personalised email grounded in the research. You review and send. Nothing goes out automatically." },
];

const FEATURES = [
  { title: "Hours, not weeks", body: "Rohit sees a fresh announcement while the founders are still deciding what to do with the money.", icon: "M12 6v6l4 2M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z" },
  { title: "Your thesis, editable", body: "Sectors, stages, weights and the minimum score live in Supabase. Change them in the UI; the next run uses them. Old scores keep their version.", icon: "M4 6h16M4 12h10M4 18h6M18 14l2 2-2 2" },
  { title: "No double outreach", body: "A startup that already has a draft or a sent email is blocked in code and by a database constraint.", icon: "M12 3l8 4v5c0 5-3.5 8-8 9-4.5-1-8-4-8-9V7l8-4zM9 12l2 2 4-4" },
  { title: "Only the good ones reach you", body: "Poor fits are rejected silently with a recorded reason. The inbox is a short list of researched, scored, drafted companies.", icon: "M3 5h18l-7 8v6l-4-2v-4L3 5z" },
];

async function liveStats() {
  if (!configured()) return null;
  try {
    return await landingStats();
  } catch {
    return null;
  }
}

function Icon({ d }: { d: string }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={d} />
    </svg>
  );
}

export default async function Landing() {
  const stats = await liveStats();
  return (
    <div className="relative overflow-hidden">
      <div className="landing-glow pointer-events-none absolute inset-x-0 top-0 h-[44rem]" />
      <div className="landing-grid pointer-events-none absolute inset-x-0 top-0 h-[40rem]" />

      <header className="relative mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
        <span className="flex items-center gap-2 text-sm font-semibold tracking-tight text-slate-900">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-600 text-white">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M13 2L4 14h7l-1 8 9-12h-7l1-8z" /></svg>
          </span>
          Funding Outreach Engine
        </span>
        <nav className="flex items-center gap-3">
          <a href="#how" className="hidden text-sm text-slate-600 hover:text-slate-900 sm:block">How it works</a>
          <ThemeToggle />
          <Link href="/today" className="rounded-full bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 dark:bg-indigo-600 dark:hover:bg-indigo-500">
            Open the app
          </Link>
        </nav>
      </header>

      {/* Hero */}
      <section className="relative mx-auto grid max-w-6xl gap-12 px-6 pb-20 pt-14 lg:grid-cols-[1.15fr_1fr] lg:items-center lg:pt-20">
        <div className="rise">
          <span className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-600">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> Live Indian pre-seed &amp; seed coverage
          </span>
          <h1 className="mt-6 text-4xl font-semibold leading-[1.08] tracking-tight text-slate-900 sm:text-5xl lg:text-6xl">
            Reach founders while the <span className="bg-gradient-to-r from-indigo-600 to-sky-500 bg-clip-text text-transparent">funding news is fresh.</span>
          </h1>
          <p className="mt-6 max-w-xl text-lg leading-relaxed text-slate-600">
            The Timed Funding Outreach Engine watches Indian startup news, finds new pre-seed and seed rounds, checks them against your accelerator thesis, researches the ones that fit and leaves a personalised draft waiting for you.
          </p>
          <div className="mt-9 flex flex-wrap items-center gap-4">
            <Link href="/today" className="group inline-flex items-center gap-2 rounded-full bg-indigo-600 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-indigo-600/25 transition hover:bg-indigo-500">
              Open your briefing
              <svg className="transition group-hover:translate-x-0.5" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
            </Link>
            <a href="#how" className="text-sm font-medium text-slate-700 hover:text-slate-900">See how it works →</a>
          </div>
          <p className="mt-6 text-xs text-slate-500">Drafts only. Nothing is ever sent automatically. All runtime AI is Gemini Flash.</p>
        </div>

        {/* Illustrative product card */}
        <div className="rise relative [animation-delay:120ms]">
          <div className="absolute -inset-4 rounded-3xl bg-gradient-to-br from-indigo-500/20 to-sky-400/20 blur-2xl" aria-hidden="true" />
          <div className="relative rounded-2xl border border-slate-200 bg-white p-5 shadow-xl">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Illustrative example</span>
              <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-700">Qualified</span>
            </div>
            <div className="mt-4 flex items-start justify-between gap-4">
              <div>
                <div className="text-lg font-semibold text-slate-900">Nimbus AI</div>
                <div className="text-sm text-slate-500">$2.5M Seed · Vertical AI · Bengaluru</div>
              </div>
              <div className="text-right">
                <div className="text-3xl font-semibold text-indigo-600">87</div>
                <div className="text-[11px] text-slate-400">fit score / 100</div>
              </div>
            </div>
            <div className="mt-4 space-y-2">
              {[["Sector fit", 22, 25], ["Technology", 13, 15], ["Founders", 8, 10], ["Traction", 6, 10]].map(([label, v, max]) => (
                <div key={label as string} className="flex items-center gap-3 text-xs text-slate-500">
                  <span className="w-20 shrink-0">{label}</span>
                  <span className="h-1.5 flex-1 rounded-full bg-slate-100"><span className="block h-full rounded-full bg-indigo-500" style={{ width: `${((v as number) / (max as number)) * 100}%` }} /></span>
                  <span className="w-9 text-right tabular-nums">{v}/{max}</span>
                </div>
              ))}
            </div>
            <div className="mt-5 rounded-xl bg-slate-50 p-4 text-[13px] leading-relaxed text-slate-600">
              <div className="mb-1 text-xs font-medium text-slate-400">Draft ready for review</div>
              Congratulations on the seed round. Your work on procurement automation for industrial teams stood out…
            </div>
            <div className="mt-3 flex items-center gap-2 text-[11px] text-slate-400">
              <span className="h-1.5 w-1.5 rounded-full bg-amber-400" /> Reviewed by you before anything is sent
            </div>
          </div>
        </div>
      </section>

      {/* Live numbers */}
      {stats && (
        <section className="relative mx-auto max-w-6xl px-6">
          <div className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-slate-200 bg-slate-200 md:grid-cols-5">
            {[
              ["Articles seen (24h)", stats.articles],
              ["Funding events", stats.events],
              ["Qualified", stats.qualified],
              ["Drafts ready", stats.drafts],
              ["System", stats.healthText.split(" · ")[0]],
            ].map(([label, value]) => (
              <div key={label as string} className="bg-white p-5">
                <div className="text-2xl font-semibold text-slate-900">{value}</div>
                <div className="mt-1 text-xs text-slate-500">{label}</div>
              </div>
            ))}
          </div>
          <p className="mt-2 text-right text-xs text-slate-400">Live from the database{stats.lastRunAt ? ` · last run ${timeAgo(stats.lastRunAt)}` : ""}</p>
        </section>
      )}

      {/* How it works */}
      <section id="how" className="relative mx-auto max-w-6xl px-6 py-24">
        <div className="max-w-2xl">
          <h2 className="text-3xl font-semibold tracking-tight text-slate-900">From announcement to draft, automatically</h2>
          <p className="mt-3 text-slate-600">A funnel that spends effort only where it pays off: cheap checks first, expensive research last.</p>
        </div>
        <ol className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {STEPS.map((s) => (
            <li key={s.n} className="rounded-2xl border border-slate-200 bg-white p-6 transition hover:-translate-y-0.5 hover:shadow-lg">
              <div className="text-xs font-semibold tracking-widest text-indigo-600">{s.n}</div>
              <h3 className="mt-3 text-lg font-semibold text-slate-900">{s.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-600">{s.body}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* Why */}
      <section className="relative border-y border-slate-200 bg-slate-50">
        <div className="mx-auto max-w-6xl px-6 py-20">
          <h2 className="max-w-xl text-3xl font-semibold tracking-tight text-slate-900">Built around how an accelerator scout works</h2>
          <div className="mt-12 grid gap-8 sm:grid-cols-2">
            {FEATURES.map((f) => (
              <div key={f.title} className="flex gap-4">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-indigo-600/10 text-indigo-600"><Icon d={f.icon} /></span>
                <div>
                  <h3 className="font-semibold text-slate-900">{f.title}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-slate-600">{f.body}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="relative mx-auto max-w-6xl px-6 py-24 text-center">
        <h2 className="mx-auto max-w-2xl text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">Start the morning with drafts, not a spreadsheet.</h2>
        <Link href="/today" className="mt-8 inline-flex items-center gap-2 rounded-full bg-indigo-600 px-7 py-3.5 text-sm font-semibold text-white shadow-lg shadow-indigo-600/25 hover:bg-indigo-500">
          Open your briefing
        </Link>
      </section>

      <footer className="relative border-t border-slate-200 py-8 text-center text-xs text-slate-500">
        Timed Funding Outreach Engine · Next.js · Supabase · Gemini Flash · Vercel
      </footer>
    </div>
  );
}
