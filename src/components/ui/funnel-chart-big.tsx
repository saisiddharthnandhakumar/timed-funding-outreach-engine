"use client";

import { useSyncExternalStore, type ReactNode } from "react";
import { motion } from "framer-motion";
import CountUp from "react-countup";
import { FunnelAxis, FunnelAxisLabel, FunnelAxisLine, FunnelArc, FunnelChart, FunnelSeries } from "reaviz";
import type { FunnelCounts } from "@/lib/queries";

/** reaviz paints SVG with literal colours, so the two themes are mirrored here from the CSS tokens in globals.css. */
const COLORS = {
  light: { arc: "#3446c9", axis: "#d6d3d1" },
  dark: { arc: "#98a5ff", axis: "#4a4642" },
};

function subscribeToTheme(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
  return () => observer.disconnect();
}
const useIsDark = () =>
  useSyncExternalStore(
    subscribeToTheme,
    () => document.documentElement.classList.contains("dark"),
    () => false,
  );

const Arrow = ({ up }: { up: boolean }) => (
  <svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {up ? <path d="M10 16V4M5 8.5l5-4.5 5 4.5" /> : <path d="M10 4v12M5 11.5l5 4.5 5-4.5" />}
  </svg>
);

/** "+12%" / "−4%" against the previous 24 hours; "new" when there was nothing to compare with; null when both are zero. */
function Delta({ now, before }: { now: number; before: number }) {
  if (now === 0 && before === 0) return null;
  if (before === 0) return <span className="rounded-full bg-accent-soft px-2.5 py-1 text-xs font-medium text-accent">New</span>;
  const pct = Math.round(((now - before) / before) * 100);
  if (pct === 0) return <span className="rounded-full bg-sunken px-2.5 py-1 text-xs font-medium text-muted">No change</span>;
  const up = pct > 0;
  return (
    <span className={`inline-flex items-center gap-0.5 rounded-full px-2 py-1 text-xs font-medium ${up ? "bg-ok-soft text-ok" : "bg-sunken text-muted"}`}>
      <Arrow up={up} />
      {Math.abs(pct)}%<span className="sr-only"> {up ? "more" : "fewer"} than the previous 24 hours</span>
    </span>
  );
}

function Headline({ label, now, before }: { label: string; now: number; before: number }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-sm text-muted">{label}</span>
      <div className="flex flex-wrap items-center gap-2">
        <CountUp className="num text-3xl font-semibold text-ink" start={0} end={now} duration={1.6} preserveValue />
        <Delta now={now} before={before} />
      </div>
      <span className="text-xs text-faint">{before === 0 ? "None in the 24 hours before" : `Compared to ${before} in the 24 hours before`}</span>
    </div>
  );
}

const DROPS: { key: keyof FunnelCounts["dropped"]; label: string; icon: ReactNode }[] = [
  { key: "notFunding", label: "Not funding news", icon: <path d="M5 4h10v12H5zM8 8h4M8 11h4" /> },
  { key: "tooOld", label: "Older than the time window", icon: <><circle cx="10" cy="10" r="7" /><path d="M10 6v4l2.5 2" /></> },
  { key: "outsideThesis", label: "Outside your stage or country", icon: <path d="M3 5h14l-5 6v5l-4-2v-3z" /> },
  { key: "belowScore", label: "Below the minimum fit score", icon: <path d="M3 15l5-5 3 3 6-7M13 6h4v4" /> },
];

export default function FunnelChartBig({ current, previous }: { current: FunnelCounts; previous: FunnelCounts }) {
  const dark = useIsDark();
  const colors = dark ? COLORS.dark : COLORS.light;

  const data = [
    { key: "Scanned", data: current.scanned },
    { key: "Recent", data: current.recent },
    { key: "Funding", data: current.funding },
    { key: "In scope", data: current.eligible },
    { key: "Qualified", data: current.qualified },
    { key: "Drafted", data: current.drafted },
  ];
  const empty = current.scanned === 0;

  return (
    <section aria-labelledby="funnel-h" className="overflow-hidden rounded-2xl border border-line bg-surface">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-6 pb-2 pt-6 sm:px-8">
        <h2 id="funnel-h" className="text-xl font-semibold tracking-tight text-ink">Last 24 hours</h2>
        <p className="text-sm text-faint">Articles scanned → recent → funding news → in scope (stage, country) → qualified → drafted</p>
      </div>

      <div className="px-3 sm:px-6">
        {empty ? (
          <p className="flex h-[250px] items-center justify-center px-6 text-center text-sm text-muted">Nothing has been scanned in the last 24 hours. Run a scan to fill this in.</p>
        ) : (
          <>
            <div className="h-[250px] w-full" aria-hidden="true">
              <FunnelChart
                id="scout-funnel"
                height={250}
                data={data}
                series={
                  <FunnelSeries
                    arc={<FunnelArc colorScheme={[colors.arc]} gradient={null} glow={{ blur: 30, color: colors.arc }} />}
                    axis={
                      <FunnelAxis
                        label={<FunnelAxisLabel className="fill-ink stroke-surface stroke-[4px] text-xs font-semibold [paint-order:stroke] [stroke-linejoin:round]" />}
                        line={<FunnelAxisLine strokeColor={colors.axis} />}
                      />
                    }
                  />
                }
              />
            </div>
            {/* The chart's own labels crowd out on a phone, so the same numbers are listed plainly there (and for screen readers). */}
            <ul className="grid grid-cols-3 gap-x-3 gap-y-2 px-3 pt-3 text-sm sm:sr-only">
              {data.map((d) => (
                <li key={d.key} className="flex items-baseline justify-between gap-2 border-b border-line pb-1.5">
                  <span className="text-muted">{d.key}</span>
                  <span className="num font-semibold text-ink">{d.data}</span>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>

      <div className="grid gap-6 px-6 pb-4 pt-5 sm:grid-cols-2 sm:px-8">
        <Headline label="Funding news found" now={current.funding} before={previous.funding} />
        <Headline label="Qualified for outreach" now={current.qualified} before={previous.qualified} />
      </div>

      <div className="px-6 pb-3 sm:px-8">
        <h3 className="border-t border-line pb-1 pt-4 text-sm font-medium text-ink">Where the rest dropped out</h3>
        <ul className="divide-y divide-line">
          {DROPS.map((d, i) => (
            <motion.li
              key={d.key}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
              className="flex items-center justify-between gap-3 py-3 text-sm"
            >
              <span className="flex min-w-0 items-center gap-2 text-muted">
                <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-faint" aria-hidden="true">{d.icon}</svg>
                <span className="truncate">{d.label}</span>
              </span>
              <span className="num font-semibold text-ink">{current.dropped[d.key]}</span>
            </motion.li>
          ))}
        </ul>
      </div>
    </section>
  );
}
