import type { Metadata } from "next";
import { Code, DisclosureSection, StatusLabel } from "@/components/ui";
import { env, hasGmailEnv, hasSupabaseEnv } from "@/lib/env";
import type { Label } from "@/lib/labels";
import { formatFrom, sendConfigProblem } from "@/lib/outreach/send";

export const metadata: Metadata = { title: "Integrations · Settings" };
export const dynamic = "force-dynamic";

const on = (text: string): Label => ({ text, tone: "positive" });
const off = (text: string): Label => ({ text, tone: "caution" });

/** Connection status only. Secret values are never read into the page, only whether they are set. */
export default function IntegrationsPage() {
  const e = env();
  const sendConfig = { apiKey: e.RESEND_API_KEY, fromEmail: e.RESEND_FROM_EMAIL, fromName: e.RESEND_FROM_NAME ?? e.OUTREACH_SENDER_NAME, replyTo: e.RESEND_REPLY_TO };
  const sendProblem = sendConfigProblem(sendConfig);

  const rows: { name: string; status: Label; detail: string; vars: string }[] = [
    {
      name: "Sending email",
      status: sendProblem ? off("Not set up") : on("Ready"),
      detail: sendProblem ? "The Send button stays disabled. You can still copy a draft or open it in Gmail." : `Approved drafts are sent from ${formatFrom(sendConfig)}${e.RESEND_REPLY_TO ? `, with replies going to ${e.RESEND_REPLY_TO}` : ""}. Each send needs your confirmation.`,
      vars: "RESEND_API_KEY, RESEND_FROM_EMAIL, RESEND_FROM_NAME, RESEND_REPLY_TO",
    },
    {
      name: "Gmail drafts",
      status: hasGmailEnv() ? on("Connected") : { text: "Not connected", tone: "neutral" },
      detail: hasGmailEnv() ? "Each new draft is also saved to your Gmail drafts folder." : "Drafts are kept in this app. “Open in Gmail” on any draft still opens a ready-to-edit message.",
      vars: "GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN",
    },
    {
      name: "AI model",
      status: e.GOOGLE_GENERATIVE_AI_API_KEY ? on("Connected") : off("Not set up"),
      detail: e.GOOGLE_GENERATIVE_AI_API_KEY ? `Reads announcements, researches companies, scores fit and writes drafts${e.GEMINI_MODEL ? ` (${e.GEMINI_MODEL})` : ""}.` : "Without it, scans can’t classify, score or write.",
      vars: "GOOGLE_GENERATIVE_AI_API_KEY, GEMINI_MODEL",
    },
    {
      name: "Database",
      status: hasSupabaseEnv() ? on("Connected") : off("Not set up"),
      detail: "Stores startups, scores, drafts and your thesis.",
      vars: "NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY",
    },
    {
      name: "Scheduled scans",
      status: e.CRON_SECRET ? on("Protected") : off("No secret set"),
      detail: e.CRON_SECRET ? "Scheduled scans are accepted only with the shared secret." : "The scheduled-scan endpoint refuses every request until a secret is set.",
      vars: "CRON_SECRET (and APP_URL + CRON_SECRET as GitHub repository secrets)",
    },
    {
      name: "Contact finding",
      status: { text: e.GITHUB_TOKEN || e.HUNTER_API_KEY ? "Extended" : "Standard", tone: "neutral" },
      detail: "Founder and company emails are found from the company’s own website. Optional keys add GitHub lookups and address verification.",
      vars: "GITHUB_TOKEN, HUNTER_API_KEY",
    },
  ];

  return (
    <div className="max-w-3xl pb-16">
      <p className="mb-6 text-body text-ink-2">What the app is connected to. Keys are configured in the hosting environment, never in the browser.</p>
      <ul className="divide-y divide-line border-y border-line">
        {rows.map((r) => (
          <li key={r.name} className="py-5">
            <div className="flex items-center justify-between gap-4">
              <h2 className="text-body font-medium text-ink">{r.name}</h2>
              <StatusLabel label={r.status} />
            </div>
            <p className="mt-1 max-w-2xl text-body text-ink-2">{r.detail}</p>
          </li>
        ))}
      </ul>
      <DisclosureSection title="Technical details" quiet className="mt-6">
        <p className="mb-3 text-meta text-ink-3">Environment variables behind each integration (names only):</p>
        <ul className="space-y-2">
          {rows.map((r) => <li key={r.name} className="text-meta text-ink-2"><span className="inline-block w-36 text-ink-3">{r.name}</span> <Code>{r.vars}</Code></li>)}
        </ul>
      </DisclosureSection>
    </div>
  );
}
