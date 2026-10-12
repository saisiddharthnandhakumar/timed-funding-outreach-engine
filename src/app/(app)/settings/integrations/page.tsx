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

  const items: Item[] = [
    { name: "Research & scoring", what: "Reads funding news, researches startups and scores them against your thesis (Gemini).", ...(e.GOOGLE_GENERATIVE_AI_API_KEY ? { tone: "ok" as const, status: "Connected" } : { tone: "bad" as const, status: "Not set up", note: "Add GOOGLE_GENERATIVE_AI_API_KEY." }) },
    { name: "Sending email", what: "Sends an approved draft when you click Send (Resend). Nothing is ever sent automatically.", ...(sendProblem ? { tone: "warn" as const, status: "Not set up", note: sendProblem } : { tone: "ok" as const, status: "Ready", note: `Sends from ${formatFrom(sendConfig)}${e.RESEND_REPLY_TO ? `, replies go to ${e.RESEND_REPLY_TO}` : ""}.` }) },
    { name: "Gmail drafts", what: "Also creates each draft in your Gmail so you can send it from there.", ...(gmail ? { tone: "ok" as const, status: "Connected" } : { tone: "neutral" as const, status: "Not connected", note: "Drafts are stored in the app. “Open in Gmail” on a draft still works." }) },
    { name: "Scheduled scans", what: "Runs the scan automatically.", ...(e.CRON_SECRET ? { tone: "ok" as const, status: "Protected", note: `Vercel: ${SCHEDULE.vercel.label}. GitHub Actions: ${SCHEDULE.github.label}.` } : { tone: "bad" as const, status: "Not protected", note: "Set CRON_SECRET so scheduled runs are authorised." }) },
    { name: "Contact search extras", what: "Optional lookups that help find founder emails (GitHub, Hunter).", tone: e.GITHUB_TOKEN || e.HUNTER_API_KEY ? "ok" : "neutral", status: e.GITHUB_TOKEN || e.HUNTER_API_KEY ? "Connected" : "Optional", note: [e.GITHUB_TOKEN ? "GitHub" : null, e.HUNTER_API_KEY ? "Hunter" : null].filter(Boolean).join(", ") || "Not needed. Public sources are always searched." },
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
