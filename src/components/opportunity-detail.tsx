import Link from "next/link";
import { CopyButton } from "@/components/copy-button";
import { ArrowLeft } from "@/components/icons";
import { FitIndicator } from "@/components/opportunity";
import { RerunContactsButton } from "@/components/rerun-contacts-button";
import { BulletList, ContactList, EvidenceList, ExternalLink, FounderList, ScoreBreakdown } from "@/components/startup-parts";
import { Code, DetailGroup, DisclosureSection, Section, StatusLabel, buttonClass } from "@/components/ui";
import { formatAmount, formatDateTime, stageLabel, timeAgo } from "@/lib/format";
import { sourceShortName, contactSearchLabel, draftLabel, researchLabel, roundLabel, verificationLabel } from "@/lib/labels";
import { fitLabel, recommendedAngle, windowHoursLeft } from "@/lib/opportunities/derive";


const LIVE = ["generated", "draft_created", "approved", "sent"];

export interface OpportunityDetailData {
  startup: any;
  founders: any[];
  rounds: any[];
  assessments: any[];
  outreach: any[];
  contacts: any[];
}

/** Everything the scout reads about one startup, in decision order. Pure: all data comes in as props. */
export function OpportunityDetailView({ d, thesis, now }: { d: OpportunityDetailData; thesis: { maxAgeHours: number; minFit: number }; now: Date }) {
  const { startup, founders, rounds, assessments, outreach, contacts } = d;

  const round = rounds[0] ?? null;
  const latest = assessments[0] ?? null;
  const profile = (startup.profile_json ?? null) as Record<string, any> | null;
  const researchSources = (startup.research_sources ?? []) as { url: string; kind: string; title: string | null }[];
  const draft = outreach.find((o) => LIVE.includes(o.status)) ?? outreach[0] ?? null;
  const preferred = contacts.find((c) => c.is_preferred) ?? null;

  const investors = (round?.funding_round_investors ?? []).filter((i: any) => i.investors?.name).map((i: any) => ({ name: i.investors.name as string, lead: !!i.is_lead }));
  const publications = [...new Set<string>((round?.funding_round_sources ?? []).map((s: any) => sourceShortName(s.sources?.name)).filter(Boolean))];
  const announcedAt: string | null = round?.earliest_source_published_at ?? (round?.announcement_date ? `${round.announcement_date}T00:00:00+05:30` : null);
  const qualified = !!latest?.qualified;
  const signals: string[] = (latest?.positive_signals ?? []).filter(Boolean);
  const concerns: string[] = (latest?.concerns ?? []).filter(Boolean);
  const angle = recommendedAngle(signals, profile?.product);
  const windowLeft = windowHoursLeft(announcedAt, thesis.maxAgeHours, now);
  const verdict = latest ? (qualified ? fitLabel(latest.total_score) : "Not a fit") : null;
  const status = round ? roundLabel(round.status, round.rejection_reason) : null;
  const talkingPoints = [...signals.slice(1, 4), ...((profile?.traction as string[] | undefined) ?? []).slice(0, 2)];
  const hasProfile = !!profile && (profile.product || profile.target_customer || profile.technology || profile.market || profile.competitive_differentiation || profile.traction?.length || profile.customers?.length || profile.partnerships?.length);

  return (
    <>
      <Link href="/opportunities" className="mb-6 inline-flex items-center gap-1.5 text-meta text-ink-2 hover:text-ink"><ArrowLeft /> Opportunities</Link>

      {/* A. Decision header */}
      <header className="border-b border-line pb-8">
        <div className="flex items-start justify-between gap-6">
          <div className="min-w-0">
            <h1 className="text-page text-ink">{startup.name}</h1>
            <p className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1">
              {!latest && status && <StatusLabel label={status} />}
              {latest && !qualified && status && <StatusLabel label={status} muted />}
            </p>
            <p className="mt-1 text-meta text-ink-2">
              {[round ? stageLabel(round.stage) : null, round?.amount != null ? formatAmount(round.amount, round.currency) : null, announcedAt ? `Announced ${timeAgo(announcedAt, now)}` : null].filter(Boolean).join(" · ")}
            </p>
            {startup.description && <p className="mt-4 max-w-2xl text-body text-ink-2">{startup.description}</p>}
          </div>
          {latest && <FitIndicator score={latest.total_score} label={verdict ?? ""} size="lg" showLabel />}
        </div>
        <div className="mt-6 flex flex-wrap items-center gap-2">
          {draft && LIVE.includes(draft.status) ? (
            <Link href={`/drafts/${draft.id}`} className={buttonClass("primary")}>{draft.status === "sent" ? "View sent email" : "Review draft"}</Link>
          ) : (
            <span className="text-meta text-ink-3">No draft yet</span>
          )}
          {startup.website && <a href={startup.website} target="_blank" rel="noreferrer noopener" className={buttonClass("ghost")}>Visit website<span className="sr-only"> (opens in a new tab)</span></a>}
        </div>
      </header>

      <div className="divide-y divide-line">
        {/* B. Why now */}
        <Section title="Why now">
          {round ? (
            <BulletList
              items={[
                `Announced ${announcedAt ? `${formatDateTime(announcedAt)}` : "recently"}${publications.length ? `, reported by ${publications.join(" and ")}` : ""}.`,
                ...(investors.length ? [`${investors.some((i: { lead: boolean }) => i.lead) ? "Led by" : "Backed by"} ${investors.filter((i: { lead: boolean }) => i.lead).map((i: { name: string }) => i.name).join(", ") || investors.map((i: { name: string }) => i.name).join(", ")}${investors.some((i: { lead: boolean }) => i.lead) && investors.some((i: { lead: boolean }) => !i.lead) ? `, with ${investors.filter((i: { lead: boolean }) => !i.lead).map((i: { name: string }) => i.name).join(", ")}` : ""}.`] : []),
                ...(announcedAt ? [windowLeft != null ? `${windowLeft}h left in your ${thesis.maxAgeHours}-hour announcement window.` : `Past your ${thesis.maxAgeHours}-hour announcement window.`] : []),
              ]}
            />
          ) : (
            <p className="text-body text-ink-2">No funding announcement is linked to this startup.</p>
          )}
        </Section>

        {/* C. Why it fits */}
        {latest && (
          <Section title="Why it fits">
            {signals.length > 0 ? <BulletList items={signals.slice(0, 4)} /> : <p className="text-body text-ink-2">No specific signals were recorded for this score.</p>}
            {concerns.length > 0 && (
              <div className="mt-5">
                <p className="mb-1.5 text-label text-ink-3">Worth checking</p>
                <BulletList items={concerns.slice(0, 3)} />
              </div>
            )}
            <div className="mt-4 -mb-3">
              <DisclosureSection title="View score breakdown" summary={`Fit ${latest.total_score} · thesis v${latest.thesis_version}`} quiet className="border-t-0">
                <ScoreBreakdown assessments={assessments} minFit={thesis.minFit} />
              </DisclosureSection>
            </div>
          </Section>
        )}

        {/* G. Outreach recommendation */}
        <Section title="Outreach">
          <div className="space-y-5">
            {angle && <div><p className="text-label text-ink-3">Recommended angle</p><p className="mt-0.5 max-w-2xl text-body text-ink">{angle}</p></div>}
            {talkingPoints.length > 0 && <div><p className="mb-1.5 text-label text-ink-3">Suggested talking points</p><BulletList items={talkingPoints} /></div>}
            <div>
              <p className="text-label text-ink-3">Draft</p>
              <p className="mt-0.5 flex flex-wrap items-center gap-x-3 text-body text-ink">
                <StatusLabel label={draftLabel(draft?.status)} muted={!draft} />
                {draft && <Link href={`/drafts/${draft.id}`} className="text-meta font-medium text-accent hover:underline">{draft.status === "sent" ? "View email" : "Open draft"}</Link>}
              </p>
            </div>
            <div>
              <p className="text-label text-ink-3">Who to contact</p>
              {preferred ? (
                <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-body text-ink">
                  {preferred.email ? <span className="inline-flex items-center gap-1">{preferred.email}<CopyButton value={preferred.email} iconOnly label="Copy address" /></span> : <ExternalLink href={preferred.contact_url}>Contact form</ExternalLink>}
                  {preferred.founder_name && <span className="text-ink-2">{preferred.founder_name}</span>}
                  <StatusLabel label={verificationLabel(preferred.verification_status)} />
                </p>
              ) : (
                <p className="mt-0.5 text-body text-ink-2">No reliable published contact found yet.{founders.some((f) => f.linkedin_url) && " A founder LinkedIn profile is listed above for manual outreach."}</p>
              )}
            </div>
          </div>
          <div className="mt-5 -mb-3">
            <DisclosureSection title="Contact details" summary={contacts.length ? `${contacts.length} found` : undefined} quiet className="border-t-0">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <p className="text-meta text-ink-2"><StatusLabel label={contactSearchLabel(startup.contact_status)} />{startup.contact_checked_at && <span className="text-ink-3"> · checked {formatDateTime(startup.contact_checked_at)}</span>}</p>
                <RerunContactsButton startupId={startup.id} />
              </div>
              {startup.contact_error && <p className="mb-3 text-meta text-bad">{startup.contact_error}</p>}
              {contacts.length > 0 ? <ContactList contacts={contacts} /> : <p className="text-meta text-ink-3">No contacts have been discovered yet.</p>}
            </DisclosureSection>
          </div>
        </Section>

        {/* D. Company snapshot */}
        <Section title="Company snapshot">
          <DetailGroup
            items={[
              ["Sector", [startup.sector, startup.subsector].filter(Boolean).join(" · ") || null],
              ["Location", [startup.hq_city, startup.hq_country].filter(Boolean).join(", ") || null],
              ["Founded", startup.founded_year],
              ["Business model", startup.business_model],
              ["Website", startup.website ? <ExternalLink key="w" href={startup.website}>{startup.domain ?? startup.website}</ExternalLink> : null],
            ]}
          />
        </Section>

        {/* E. Product & traction */}
        <Section title="Product & traction">
          {!hasProfile ? (
            <p className="text-body text-ink-2">Research on this company hasn’t produced details yet. <StatusLabel label={researchLabel(startup.enrichment_status)} /></p>
          ) : (
            <div className="space-y-5">
              {([["What they do", profile?.product], ["Who it’s for", profile?.target_customer], ["How it’s different", profile?.competitive_differentiation], ["Technology", profile?.technology], ["Market", profile?.market]] as [string, string | null][])
                .filter(([, v]) => v)
                .map(([k, v]) => (
                  <div key={k}><p className="text-label text-ink-3">{k}</p><p className="mt-0.5 max-w-2xl text-body text-ink">{v}</p></div>
                ))}
              {(["traction", "customers", "partnerships"] as const).filter((k) => profile?.[k]?.length).map((k) => (
                <div key={k}><p className="mb-1.5 text-label text-ink-3">{k === "traction" ? "Traction" : k === "customers" ? "Customers" : "Partnerships"}</p><BulletList items={profile![k] as string[]} /></div>
              ))}
              {(profile?.unknowns?.length ?? 0) > 0 && <p className="text-meta text-ink-3">Not established by research: {(profile!.unknowns as string[]).join(", ")}.</p>}
            </div>
          )}
        </Section>

        {/* F. Founders */}
        <Section title="Founders"><FounderList founders={founders} /></Section>

        {/* H. Sources & evidence */}
        <div>
          <DisclosureSection title="Sources and evidence" summary={`${publications.length || 0} ${publications.length === 1 ? "publication" : "publications"} · ${researchSources.length} research ${researchSources.length === 1 ? "source" : "sources"}`} className="border-t-0">
            <EvidenceList rounds={rounds} sources={researchSources} />
          </DisclosureSection>

          {/* I. System details */}
          <DisclosureSection title="System details" quiet>
            <DetailGroup
              columns={2}
              items={[
                ["Research", <StatusLabel key="r" label={researchLabel(startup.enrichment_status)} />],
                ["Contact search", <StatusLabel key="c" label={contactSearchLabel(startup.contact_status)} />],
                ["Funding event status", round ? <span key="s">{round.status}{round.rejection_reason ? <> · <Code>{round.rejection_reason}</Code></> : null}</span> : null],
                ["Scored under thesis", latest ? `v${latest.thesis_version} · ${latest.model_name}` : null],
                ["Assessment confidence", latest?.confidence != null ? String(latest.confidence) : null],
                ["First scored", latest ? formatDateTime(latest.assessed_at) : null],
                ["Draft provider", draft ? `${draft.draft_provider}${draft.model_name ? ` · ${draft.model_name}` : ""}` : null],
                ["Researched", startup.enriched_at ? formatDateTime(startup.enriched_at) : null],
                ["Startup ID", <Code key="id">{startup.id}</Code>],
                ["Funding event ID", round ? <Code key="rid">{round.id}</Code> : null],
              ]}
            />
          </DisclosureSection>
        </div>
      </div>
    </>
  );
}
