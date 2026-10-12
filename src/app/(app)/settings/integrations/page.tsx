import { SetupNotice, StatusChip, Section, type Tone } from "@/components/ui";
import { configured } from "@/lib/queries";
import { env, hasGmailEnv } from "@/lib/env";
import { SCHEDULE } from "@/lib/pipeline/health";
import { formatFrom, sendConfigProblem } from "@/lib/outreach/send";

export const dynamic = "force-dynamic";

interface Item {
  name: string;
  what: string;
  tone: Tone;
  status: string;
  note?: string;
}

/** Read-only. Reports whether each connection is set up; secrets are never sent to the browser. */
export default function IntegrationsPage() {
  if (!configured()) return <SetupNotice message="Supabase is not configured." />;
  const e = env();
  const sendConfig = { apiKey: e.RESEND_API_KEY, fromEmail: e.RESEND_FROM_EMAIL, fromName: e.RESEND_FROM_NAME ?? e.OUTREACH_SENDER_NAME, replyTo: e.RESEND_REPLY_TO };
  const sendProblem = sendConfigProblem(sendConfig);
  const gmail = hasGmailEnv();
  const telegram = Boolean(e.TELEGRAM_BOT_TOKEN && e.TELEGRAM_CHAT_ID);

  const items: Item[] = [
    { name: "Research & scoring", what: "Reads funding news, researches startups and scores them against your thesis (Gemini).", ...(e.GOOGLE_GENERATIVE_AI_API_KEY ? { tone: "ok" as const, status: "Connected", note: e.OPENROUTER_API_KEY ? "Backup: OpenRouter takes over automatically if Gemini runs out of quota." : undefined } : { tone: "bad" as const, status: "Not set up", note: "Add GOOGLE_GENERATIVE_AI_API_KEY." }) },
    { name: "Sending email", what: "Sends an approved draft when you click Send (Resend). Nothing is ever sent automatically.", ...(sendProblem ? { tone: "warn" as const, status: "Not set up", note: sendProblem } : { tone: "ok" as const, status: "Ready", note: `Sends from ${formatFrom(sendConfig)}${e.RESEND_REPLY_TO ? `, replies go to ${e.RESEND_REPLY_TO}` : ""}.` }) },
    { name: "Gmail drafts", what: "Also creates each draft in your Gmail so you can send it from there.", ...(gmail ? { tone: "ok" as const, status: "Connected" } : { tone: "neutral" as const, status: "Not connected", note: "Drafts are stored in the app. “Open in Gmail” on a draft still works." }) },
    { name: "Scheduled scans", what: "Runs the scan automatically.", ...(e.CRON_SECRET ? { tone: "ok" as const, status: "Protected", note: `Vercel: ${SCHEDULE.vercel.label}. GitHub Actions: ${SCHEDULE.github.label}.` } : { tone: "bad" as const, status: "Not protected", note: "Set CRON_SECRET so scheduled runs are authorised." }) },
    { name: "Founder emails (Hunter)", what: "Looks up a founder’s work email when their own site, GitHub and the web don’t publish one. Only addresses Hunter verifies as valid are ever put on a draft.", ...(e.HUNTER_API_KEY ? { tone: "ok" as const, status: "Connected", note: `Up to ${e.CONTACT_HUNTER_FINDER_MONTHLY_BUDGET} lookups a month, so the free plan is never exceeded.` } : { tone: "neutral" as const, status: "Optional", note: "Not connected. Public sources are still searched." }) },
    { name: "Web search (Serper, Tavily)", what: "Finds a startup’s website, LinkedIn profile and contact pages (Serper), and gathers recent web context for research (Tavily). Emails still count only when published on a page we fetched.", ...(e.SERPER_API_KEY || e.TAVILY_API_KEY ? { tone: "ok" as const, status: "Connected", note: `${[e.SERPER_API_KEY ? "Serper" : null, e.TAVILY_API_KEY ? "Tavily" : null].filter(Boolean).join(" + ")}; capped at ${e.SERPER_MONTHLY_BUDGET} / ${e.TAVILY_MONTHLY_BUDGET} searches a month so a free plan isn’t exceeded.` } : { tone: "neutral" as const, status: "Optional", note: "Not connected. Websites are still found by guessing the domain; add SERPER_API_KEY and TAVILY_API_KEY to improve coverage." }) },
    { name: "Telegram alerts", what: `Messages you when a startup is found and its draft is ready, and again ${e.TELEGRAM_REMINDER_LEAD_HOURS} hours before its ${e.OUTREACH_WINDOW_HOURS}-hour window closes.`, ...(telegram ? { tone: "ok" as const, status: "Connected", note: e.APP_URL ? undefined : "Set APP_URL so the alerts link to the draft." } : { tone: "neutral" as const, status: "Not set up", note: "Add TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID (README → Telegram)." }) },
  ];

  return (
    <>
      <p className="mb-8 max-w-2xl text-[0.95rem] leading-relaxed text-muted">What the app is connected to. This page is read-only; connections are configured where the app is deployed.</p>
      <Section>
        <ul className="divide-y divide-line">
          {items.map((i) => (
            <li key={i.name} className="flex flex-wrap items-start justify-between gap-x-6 gap-y-1 py-4 first:pt-0">
              <div className="min-w-0 max-w-xl">
                <h2 className="font-medium text-ink">{i.name}</h2>
                <p className="mt-0.5 text-sm text-muted">{i.what}</p>
                {i.note && <p className="mt-1 text-sm text-faint">{i.note}</p>}
              </div>
              <StatusChip tone={i.tone}>{i.status}</StatusChip>
            </li>
          ))}
        </ul>
      </Section>
    </>
  );
}
