import Link from "next/link";
import { DisclosureSection } from "@/components/disclosure-section";
import { DraftStatus, FitIndicator, FundingMeta, SectorTag } from "@/components/opportunity/parts";
import { CompanySnapshot } from "@/components/startup/company-snapshot";
import { ContactDetails } from "@/components/startup/contact-details";
import { EvidenceList } from "@/components/startup/evidence-list";
import { BulletList, Field, FieldGrid } from "@/components/startup/fields";
import { FounderCard } from "@/components/startup/founder-card";
import { ScoreBreakdown } from "@/components/startup/score-breakdown";
import { TechnicalDetails } from "@/components/startup/technical-details";
import { Section, StatusChip, btn } from "@/components/ui";
import { FIT_TIER_LABEL, fitTier } from "@/lib/opportunity/model";
import { buildAngle, buildReadiness, buildWhyFit, buildWhyNow } from "@/lib/opportunity/why";
import { draftState, researchStatusLabel, rejectionLabel, roundStatusLabel, verificationLabel } from "@/lib/labels";
import { formatAmount } from "@/lib/format";

const LIVE = ["generated", "draft_created", "approved", "sent"];

/** The startup page as a decision story. Pure rendering of `startupDetail()` data. */
export function StartupView({ d }: { d: any }) {
  const { startup, founders, rounds, assessments, outreach, contacts } = d;

  const assessment = assessments.find((a: any) => a.qualified) ?? assessments[0] ?? null;
  const round = (assessment && rounds.find((r: any) => r.id === assessment.funding_round_id)) ?? rounds[0] ?? null;
  const draft = outreach.find((o: any) => LIVE.includes(o.status)) ?? outreach[0] ?? null;
  const dState = draftState(draft?.status);
  const preferred = (contacts as any[]).find((c) => c.is_preferred) ?? null;
  const profile = startup.profile_json as Record<string, any> | null;
  const researchSources = (startup.research_sources ?? []) as { url: string; kind: string; title: string | null }[];

  const investors = ((round?.funding_round_investors ?? []) as any[]).filter((i) => i.investors?.name).map((i) => ({ name: i.investors.name as string, lead: Boolean(i.is_lead) }));
  const announcedAt = round?.earliest_source_published_at ?? (round?.announcement_date ? `${round.announcement_date}T00:00:00Z` : null);
  const whyNow = buildWhyNow({ name: startup.name, stage: round?.stage ?? null, amount: round?.amount ?? null, currency: round?.currency ?? null, announcedAt, investors });
  const signals: string[] = assessment?.positive_signals ?? [];
  const whyFit = buildWhyFit({ signals, sector: startup.sector, subsector: startup.subsector, businessModel: startup.business_model }, 6);
  const founderName = preferred?.founder_name ?? draft?.recipient_name ?? founders[0]?.name ?? null;
  const { angle, talkingPoints } = buildAngle({
    founderFirstName: founderName ? founderName.split(/\s+/)[0] : null,
    stage: round?.stage ?? null,
    signals,
    traction: profile?.traction ?? [],
    customers: profile?.customers ?? [],
  });
  const readiness = buildReadiness({ exists: Boolean(draft), status: draft?.status ?? null, recipientName: draft?.recipient_name ?? null, recipientEmail: draft?.recipient_email ?? null, emailVerification: preferred?.verification_status ?? null });

  const tier = fitTier(assessment?.total_score, assessment?.scoring_snapshot?.minimum_fit_score);
  const filtered = round && (round.status === "rejected" || !assessment?.qualified);
  const rowForMeta = { stage: round?.stage ?? null, amountText: formatAmount(round?.amount, round?.currency), location: [startup.hq_city, startup.hq_country].filter(Boolean).join(", ") || null, announcedAt };

  return (
    <>
      <nav aria-label="Breadcrumb" className="mb-6 text-sm"><Link href="/opportunities" className="text-muted hover:text-ink hover:underline">← Opportunities</Link></nav>

      {/* A · Decision header */}
      <header className="mb-10">
        <div className="flex items-start justify-between gap-6">
          <div className="min-w-0">
            <h1 className="text-3xl font-semibold tracking-tight text-ink sm:text-4xl">{startup.name}</h1>
            {startup.description && <p className="mt-2 max-w-2xl text-lg leading-relaxed text-muted">{startup.description}</p>}
          </div>
          {assessment && <FitIndicator score={assessment.total_score} minimum={assessment.scoring_snapshot?.minimum_fit_score} size="lg" />}
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2">
          {assessment && <span className="text-sm font-semibold text-ink">{FIT_TIER_LABEL[tier]}<span className="num font-normal text-muted"> · {assessment.total_score} / 100</span></span>}
          <FundingMeta o={rowForMeta} />
          <SectorTag o={startup} />
        </div>
        <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-3">
          {draft && dState === "ready" && <Link href={`/drafts/${draft.id}`} className={btn.primary}>Review draft</Link>}
          {draft && dState === "approved" && <Link href={`/drafts/${draft.id}`} className={btn.primary}>Open draft to send</Link>}
          {draft && (dState === "sent" || dState === "rejected") && <Link href={`/drafts/${draft.id}`} className={btn.secondary}>View draft</Link>}
          <DraftStatus state={dState} />
          {filtered && round && <StatusChip tone="neutral">{rejectionLabel(round.rejection_reason) ?? roundStatusLabel(round.status)}</StatusChip>}
        </div>
      </header>

      <div className="space-y-10">
        {/* B · Why now */}
        <Section id="why-now" title="Why now" hint="Based on the reported round">
          <p className="text-xl font-medium leading-snug tracking-tight text-ink">{whyNow.summary}</p>
          {whyNow.points.length > 1 && <div className="mt-4"><BulletList items={whyNow.points} /></div>}
        </Section>

        {/* C · Why it fits */}
        {assessment ? (
          <Section id="why-fit" title="Why it fits">
            <BulletList items={whyFit} />
            <div className="mt-4">
              <DisclosureSection title="View score breakdown" hint={`Scored against thesis v${assessment.thesis_version}`}>
                {assessments.map((a: any, i: number) => <ScoreBreakdown key={a.id} a={a} latest={i === 0} />)}
              </DisclosureSection>
            </div>
          </Section>
        ) : (
          <Section id="why-fit" title="Why it fits">
            <p className="text-[0.95rem] text-muted">Not scored against the thesis. {round ? `Status: ${roundStatusLabel(round.status)}.` : ""}</p>
          </Section>
        )}

        {/* D · Company snapshot */}
        <Section id="snapshot" title="Company snapshot"><CompanySnapshot startup={startup} round={round} /></Section>

        {/* E · Product & traction */}
        <Section id="product" title="Product & traction">
          {profile ? (
            <div className="space-y-6">
              <FieldGrid cols={2}>
                <Field label="Product">{profile.product}</Field>
                <Field label="Target customer">{profile.target_customer}</Field>
                <Field label="Technology">{profile.technology}</Field>
                <Field label="Market">{profile.market}</Field>
                <Field label="Differentiation">{profile.competitive_differentiation}</Field>
              </FieldGrid>
              {(["traction", "customers", "partnerships"] as const).map((k) =>
                (profile[k] as string[] | undefined)?.length ? (
                  <div key={k}>
                    <div className="mb-1.5 text-xs font-medium text-faint">{k[0].toUpperCase() + k.slice(1)}</div>
                    <BulletList items={profile[k]} />
                  </div>
                ) : null,
              )}
              {(profile.unknowns?.length ?? 0) > 0 && <p className="text-sm text-faint">Not established by research: {(profile.unknowns as string[]).join(", ")}.</p>}
            </div>
          ) : (
            <p className="text-[0.95rem] text-muted">{researchStatusLabel(startup.enrichment_status)}. Research notes appear here once the startup has been researched.</p>
          )}
        </Section>

        {/* F · Founders */}
        <Section id="founders" title="Founders">
          {founders.length === 0 ? <p className="text-[0.95rem] text-muted">No founders identified from public sources.</p> : <ul className="divide-y divide-line">{founders.map((f: any) => <FounderCard key={f.id} founder={f} />)}</ul>}
        </Section>

        {/* G · Outreach recommendation */}
        <Section id="outreach" title="Outreach recommendation" hint="Built from the facts above, not written by a model">
          <div className="space-y-6">
            {angle && (
              <div>
                <div className="mb-1 text-xs font-medium text-faint">Recommended angle</div>
                <p className="text-[0.95rem] leading-relaxed text-ink">{angle}</p>
              </div>
            )}
            {talkingPoints.length > 0 && (
              <div>
                <div className="mb-1.5 text-xs font-medium text-faint">Key talking points</div>
                <BulletList items={talkingPoints} />
              </div>
            )}
            <div>
              <div className="mb-1.5 text-xs font-medium text-faint">Draft readiness</div>
              <p className="text-[0.95rem] font-medium text-ink">{readiness.summary}</p>
              {draft && (
                <>
                  <ul className="mt-2 grid gap-1 text-sm sm:grid-cols-2">
                    {readiness.checks.map((c) => (
                      <li key={c.label} className="flex items-center gap-2 text-muted">
                        <span aria-hidden="true" className={c.ok ? "text-ok" : "text-faint"}>{c.ok ? "✓" : "–"}</span>
                        {c.label}
                        <span className="sr-only">{c.ok ? " (yes)" : " (not yet)"}</span>
                      </li>
                    ))}
                  </ul>
                  <p className="mt-3 text-sm text-faint">Subject: {draft.subject}</p>
                </>
              )}
            </div>
          </div>
          <div className="mt-6">
            <DisclosureSection title="Contact details" hint={preferred ? `${preferred.email ?? "Contact form"} · ${verificationLabel(preferred.verification_status)}` : "No reliable contact yet"}>
              <ContactDetails startup={startup} contacts={contacts} />
            </DisclosureSection>
          </div>
        </Section>

        {/* H · Sources & evidence, I · Technical details */}
        <div>
          <DisclosureSection title="Sources & evidence" hint="Articles, research links and exact timestamps">
            <EvidenceList rounds={rounds} researchSources={researchSources} confidence={assessment?.confidence != null ? Number(assessment.confidence) : null} />
          </DisclosureSection>
          <DisclosureSection title="Technical details" hint="For audit and debugging" tone="technical">
            <TechnicalDetails d={d} />
          </DisclosureSection>
          <div className="border-t border-line" />
        </div>
      </div>
    </>
  );
}
