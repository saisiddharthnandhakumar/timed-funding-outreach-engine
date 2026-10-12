// When the schedulers fire. Mirrors the committed configuration:
//   - vercel.json                          cron "30 3 * * *"    → daily 03:30 UTC (09:00 IST), the Hobby-plan anchor
//   - .github/workflows/pipeline-cron.yml  cron "15 */2 * * *"  → minute 15 of every even UTC hour
// Both call the same CRON_SECRET-protected endpoint, so a run records `trigger = cron` either way.
export const SCHEDULES = {
  vercel: { label: "Daily at 09:00 IST", utcHour: 3, utcMinute: 30 },
  github: { label: "Every 2 hours", utcMinute: 15, everyHours: 2 },
} as const;

export function nextVercelRun(now: Date = new Date()): Date {
  const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), SCHEDULES.vercel.utcHour, SCHEDULES.vercel.utcMinute));
  if (next.getTime() <= now.getTime()) next.setUTCDate(next.getUTCDate() + 1);
  return next;
}

export function nextGithubRun(now: Date = new Date()): Date {
  const { utcMinute, everyHours } = SCHEDULES.github;
  const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), now.getUTCHours(), utcMinute));
  while (next.getTime() <= now.getTime() || next.getUTCHours() % everyHours !== 0) next.setUTCHours(next.getUTCHours() + 1);
  return next;
}

/** The soonest scheduled run of either scheduler. */
export function nextScheduledRun(now: Date = new Date()): Date {
  const a = nextVercelRun(now);
  const b = nextGithubRun(now);
  return a < b ? a : b;
}
