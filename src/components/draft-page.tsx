import Link from "next/link";
import { DraftWorkspace } from "@/components/draft-workspace";
import { AlertIcon, ArrowLeft, CheckIcon } from "@/components/icons";
import { Code, DetailGroup, DisclosureSection } from "@/components/ui";
import { formatAmount, formatDateTime, stageLabel, timeAgo } from "@/lib/format";
import { messageChecks } from "@/lib/drafts/checks";
import { verificationLabel } from "@/lib/labels";
import { formatFrom, sendConfigProblem, type SendConfig } from "@/lib/outreach/send";
import type { VerificationStatus } from "@/lib/contacts/types";

/** The reading surface for one draft. Pure: the draft and the send configuration come in as props. */
export function DraftPageView({ d, sendConfig }: { d: any; sendConfig: SendConfig }) {
  const blocked = sendConfigProblem(sendConfig) ?? (!d.recipient_email ? "Add a recipient email (Edit) before sending." : null);
  const startup = d.startups ?? { id: d.startup_id, name: "Unknown startup", research_sources: [] };
  const round = d.funding_rounds ?? null;
  const verification = (d.recipientVerification ?? null) as VerificationStatus | null;

  const checks = messageChecks({
    startupName: startup.name,
    stageLabel: round ? stageLabel(round.stage) : null,
    amountLabel: round?.amount != null ? formatAmount(round.amount, round.currency) : null,
    subject: d.subject,
    body: d.body,
    recipientName: d.recipient_name,
    recipientEmail: d.recipient_email,
    recipientVerification: verification,
    researchSourceCount: Array.isArray(startup.research_sources) ? startup.research_sources.length : 0,
  });

  const meta = [round ? stageLabel(round.stage) : null, round?.amount != null ? formatAmount(round.amount, round.currency) : null, d.fit_assessments?.total_score != null ? `Fit ${d.fit_assessments.total_score}` : null].filter((x) => x && x !== "—").join(" · ");
  const recipientNote = d.recipient_email ? (verification ? verificationLabel(verification).text : "entered by hand") : null;

  return (
    <div className="mx-auto max-w-3xl">
      <Link href="/drafts" className="mb-6 inline-flex items-center gap-1.5 text-meta text-ink-2 hover:text-ink"><ArrowLeft /> Drafts</Link>

      <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-page text-ink">{startup.name}</h1>
          <p className="mt-1 text-meta text-ink-2">{meta}</p>
        </div>
      </header>

      <DraftWorkspace
        draft={{
          id: d.id,
          status: d.status,
          subject: d.subject,
          body: d.body,
          recipientName: d.recipient_name,
          recipientEmail: d.recipient_email,
          sentNote: d.status === "sent" && d.sent_at ? `Sent ${timeAgo(d.sent_at)}${d.recipient_email ? ` to ${d.recipient_email}` : ""}.` : d.status === "rejected" ? "This draft was rejected." : d.status === "cancelled" ? "This draft was cancelled." : null,
        }}
        recipientNote={recipientNote}
        from={formatFrom(sendConfig) || "your configured sender"}
        sendBlockedReason={blocked}
      >
        <section aria-labelledby="why-msg" className="mt-8">
          <h2 id="why-msg" className="mb-3 text-heading text-ink">Why this message</h2>
          <ul className="space-y-2">
            {checks.map((c, i) => (
              <li key={i} className="flex items-start gap-2.5 text-body text-ink">
                {c.ok ? <CheckIcon className="mt-1 shrink-0 text-ok" /> : <AlertIcon className="mt-1 shrink-0 text-warn" />}
                <span><span className="sr-only">{c.ok ? "Good: " : "Check: "}</span>{c.text}</span>
              </li>
            ))}
          </ul>
        </section>
      </DraftWorkspace>

      <div className="mt-10 border-t border-line pt-4">
        <p className="mb-1 text-meta"><Link href={`/opportunities/${startup.id}`} className="font-medium text-accent hover:underline">See why {startup.name} fits and the evidence behind it →</Link></p>
        <DisclosureSection title="Delivery details" quiet className="mt-3">
          <DetailGroup
            columns={2}
            items={[
              ["Stored as", d.draft_provider === "gmail" ? "Gmail draft and in this app" : "In this app only"],
              ["Sent from", formatFrom(sendConfig) || "Not configured"],
              ["Created", formatDateTime(d.created_at)],
              ["Written by", d.model_name],
              ["Gmail draft ID", d.external_draft_id ? <Code key="g">{d.external_draft_id}</Code> : null],
              ["Draft ID", <Code key="i">{d.id}</Code>],
            ]}
          />
        </DisclosureSection>
      </div>
    </div>
  );
}
