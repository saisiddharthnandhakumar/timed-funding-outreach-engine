import { domainFromUrl, errorMessage, mapLimit } from "@/lib/util/text";
import type { Budget } from "./budget";
import { classifyFoundEmail } from "./attribute";
import { crawlCompanySite } from "./crawler";
import { extractFromHtml } from "./extract";
import type { GithubProvider } from "./github";
import { RateLimiter, type PageFetcher } from "./http";
import { registrableDomain, sameCompanyDomain } from "./names";
import { candidateFromHunter, finderName, type FounderEmailFinder } from "./hunter";
import { guessFounderEmails, inferPattern } from "./patterns";
import { mergeAll, selectPreferred, type PreferredType } from "./rank";
import type { RobotsGuard } from "./robots";
import type { WebSearch } from "./search";
import { OUTREACH_SAFE, contactKey, type ContactCandidate, type ContactStatus, type FounderRef, type StartupRef, type StoredContact } from "./types";
import { isSyntaxValid, QuotaExhaustedError, type EmailVerifier, type MxChecker } from "./verify";

export interface ContactStore {
  loadStartup(id: string): Promise<StartupRef | null>;
  loadFounders(startupId: string): Promise<FounderRef[]>;
  loadContacts(startupId: string): Promise<StoredContact[]>;
  /** Idempotent upsert keyed by (startup, email) / (startup, contact_url). */
  saveContacts(startupId: string, contacts: StoredContact[]): Promise<void>;
  setPreferred(startupId: string, key: string | null): Promise<void>;
  updateStartup(startupId: string, patch: { status: ContactStatus; checkedAt: string; error: string | null }): Promise<void>;
  /** Fill recipient on still-editable drafts that have none. Returns rows updated. */
  applyRecipientToOpenDrafts(startupId: string, name: string | null, email: string): Promise<number>;
  /** Remember a website found during contact search (only when none is stored). */
  saveWebsite?(startupId: string, website: string): Promise<void>;
}

export interface ContactDeps {
  store: ContactStore;
  fetcher: PageFetcher;
  robots: RobotsGuard;
  mx: MxChecker;
  github: GithubProvider | null;
  search: WebSearch | null;
  verifier: EmailVerifier | null;
  /** Hunter Email Finder: asks for a specific founder's work address. Optional; budgeted per month. */
  finder?: FounderEmailFinder | null;
  /** Backstop when the startup has no website: find it from the company name (no AI quota). */
  resolveWebsite?: (companyName: string) => Promise<string | null>;
  budget: Budget;
  config: { maxPages: number; reenrichDays: number; verifierMonthlyLimit: number; maxVerificationsPerCompany: number; /** monthly Email Finder lookups (Hunter free plan is small) */ finderMonthlyLimit?: number; /** politeness delay between requests to one host (default 300 ms) */ crawlDelayMs?: number };
  now?: () => Date;
  log?: (eventType: string, message: string, meta?: Record<string, unknown>) => Promise<void>;
}

export interface ContactOutcome {
  startupId: string;
  status: "completed" | "not_found" | "failed" | "skipped";
  skippedReason?: "recent" | "startup_missing" | "deadline";
  preferredType: PreferredType | null;
  preferredEmail: string | null;
  founderEmails: number;
  companyEmails: number;
  warnings: string[];
}

const confirmed = (c: ContactCandidate) => OUTREACH_SAFE.has(c.status);
const empty = (startupId: string, status: ContactOutcome["status"], extra: Partial<ContactOutcome> = {}): ContactOutcome => ({
  startupId, status, preferredType: null, preferredEmail: null, founderEmails: 0, companyEmails: 0, warnings: [], ...extra,
});

/**
 * Founder-first contact discovery for ONE startup. Waterfall (cheapest/most reliable first):
 *   A. official website (crawl: mailto, text, JSON-LD, Cloudflare-protected)      — free
 *   C. GitHub public profile/org email                                              — free public API
 *   B. Google-grounded search → fetch cited pages, extract literally published emails — free Gemini tier, budgeted
 *   then pattern guesses (stored, never used), MX/provider verification, ranking.
 * Company mailboxes published on the site are collected in the same crawl and used only when no reliable
 * founder email exists. Every failure is recorded in `warnings`; nothing throws for a single bad source.
 */
export async function enrichStartupContacts(deps: ContactDeps, startupId: string, opts: { force?: boolean } = {}): Promise<ContactOutcome> {
  const now = (deps.now ?? (() => new Date()))();
  const nowIso = now.toISOString();
  const startup = await deps.store.loadStartup(startupId);
  if (!startup) return empty(startupId, "skipped", { skippedReason: "startup_missing" });

  if (!opts.force && (startup.contactStatus === "completed" || startup.contactStatus === "not_found") && startup.contactCheckedAt) {
    const ageDays = (now.getTime() - new Date(startup.contactCheckedAt).getTime()) / 86_400_000;
    if (ageDays < deps.config.reenrichDays) return empty(startupId, "skipped", { skippedReason: "recent" });
  }

  const warnings: string[] = [];
  try {
    await deps.store.updateStartup(startupId, { status: "in_progress", checkedAt: nowIso, error: null });
    const founders = await deps.store.loadFounders(startupId);
    if (!startup.website && deps.resolveWebsite) {
      try {
        const found = await deps.resolveWebsite(startup.name);
        if (found) {
          startup.website = found;
          startup.domain = startup.domain ?? domainFromUrl(found);
          await deps.store.saveWebsite?.(startupId, found);
          await deps.log?.("website_resolved", `${startup.name}: official website found at ${found}`, { website: found });
        }
      } catch (err) {
        warnings.push(`website lookup: ${errorMessage(err)}`);
      }
    }
    const domain = startup.domain ?? domainFromUrl(startup.website);
    const existing = await deps.store.loadContacts(startupId);
    const found: ContactCandidate[] = [];
    let attempted = 0;
    let errored = 0;

    const lacksConfirmed = (f: FounderRef) => ![...existing, ...found].some((c) => c.kind === "founder" && c.founderName === f.name && confirmed(c));
    const haveConfirmedCompany = () => [...existing, ...found].some((c) => c.kind === "company" && confirmed(c));
    const addFromPage = (url: string, html: string, source: "company_website" | "web_search", officialSite: boolean) => {
      const ex = extractFromHtml(html, url);
      for (const f of ex.emails) {
        const c = classifyFoundEmail({ found: f, founders, companyDomain: domain, source, sourceUrl: url, officialSite });
        if (c) found.push(c);
      }
      if (ex.contactFormUrl && officialSite && !found.some((c) => c.kind === "contact_form")) {
        found.push({ kind: "contact_form", email: null, contactUrl: ex.contactFormUrl, founderId: null, founderName: null, mailboxRole: null, status: "publicly_confirmed", source: "company_website", sourceUrl: ex.contactFormUrl, evidence: "Public contact form on the official website", mxValid: null, confidence: 50 });
      }
    };

    // ── A. official website ──
    if (startup.website) {
      attempted++;
      try {
        const crawl = await crawlCompanySite(startup.website, { fetcher: deps.fetcher, robots: deps.robots, maxPages: deps.config.maxPages, limiter: new RateLimiter(deps.config.crawlDelayMs ?? 300) });
        warnings.push(...crawl.notes.map((n) => `website: ${n}`));
        if (crawl.pages.length === 0) errored++;
        for (const p of crawl.pages) addFromPage(p.url, p.html, "company_website", true);
      } catch (err) {
        errored++;
        warnings.push(`website: ${errorMessage(err)}`);
      }
    } else {
      warnings.push("website: no official website known for this startup");
    }

    // ── C. GitHub (free public API) ──
    if (deps.github) {
      const targets = founders.filter(lacksConfirmed);
      if (targets.length || !haveConfirmedCompany()) attempted++;
      let ghErrored = false;
      try {
        for (const f of targets) {
          if (deps.github.quotaExhausted) break;
          const c = await deps.github.founderEmail(f, { name: startup.name, domain });
          if (c) found.push(c);
        }
        if (!haveConfirmedCompany() && !deps.github.quotaExhausted) {
          const c = await deps.github.companyEmail({ name: startup.name, domain });
          if (c) found.push(c);
        }
      } catch (err) {
        ghErrored = true;
        warnings.push(`github: ${errorMessage(err)}`);
      }
      if (deps.github.quotaExhausted) {
        warnings.push("github: API quota exhausted; remaining lookups skipped");
        ghErrored = true;
      }
      if (ghErrored) errored++;
    }

    // ── B. grounded web search ──
    if (deps.search && (founders.some(lacksConfirmed) || !haveConfirmedCompany())) {
      attempted++;
      try {
        const res = await deps.search.search({ companyName: startup.name, domain, founders });
        warnings.push(...res.notes.map((n) => `search: ${n}`));
        if (res.budgetExhausted) errored++;
        for (const p of res.pages) addFromPage(p.url, p.html, "web_search", sameCompanyDomain(new URL(p.url).hostname, domain));
        // Addresses only the model mentioned (not on any fetched page) are unverified, company-domain only.
        for (const e of res.modelEmails) {
          if (found.some((c) => c.email === e) || !sameCompanyDomain(e.split("@")[1], domain)) continue;
          found.push({ kind: "company", email: e, contactUrl: null, founderId: null, founderName: null, mailboxRole: "other", status: "unverified", source: "web_search", sourceUrl: null, evidence: "Mentioned in search summary but not found on any fetched page", mxValid: null, confidence: 10 });
        }
      } catch (err) {
        errored++;
        warnings.push(`search: ${errorMessage(err)}`);
      }
    }

    // ── D. Hunter Email Finder: a founder with no confirmed address yet, at a domain we know ──
    if (deps.finder && domain) {
      const targets = founders.filter((f) => lacksConfirmed(f) && finderName(f));
      if (targets.length) attempted++;
      let hunterErrored = false;
      for (const f of targets) {
        if (!(await deps.budget.consume(deps.finder.name, deps.config.finderMonthlyLimit ?? 20))) {
          warnings.push(`${deps.finder.name}: monthly email-finder budget exhausted`);
          hunterErrored = true;
          break;
        }
        try {
          const hit = await deps.finder.find({ domain: registrableDomain(domain), ...finderName(f)! });
          const c = hit ? candidateFromHunter(f, hit, domain) : null;
          if (c) found.push(c);
        } catch (err) {
          hunterErrored = true;
          warnings.push(`${deps.finder.name}: ${err instanceof QuotaExhaustedError ? "quota exhausted" : errorMessage(err)}`);
          if (err instanceof QuotaExhaustedError) break;
        }
      }
      if (hunterErrored) errored++;
    }

    // ── guessed candidates (kept for later, never used for outreach) ──
    if (domain) {
      const known = found.filter((c) => c.kind === "founder" && c.email && c.founderName && confirmed(c)).map((c) => ({ email: c.email!, name: c.founderName! }));
      const inferred = inferPattern(known);
      for (const f of founders.filter(lacksConfirmed)) found.push(...guessFounderEmails(f, domain, inferred));
    }

    // ── verification layer: syntax → MX → optional provider ──
    const checked: ContactCandidate[] = [];
    for (const c of found) {
      if (c.email) {
        if (!isSyntaxValid(c.email)) continue;
        const mx = await deps.mx.check(c.email.split("@")[1]);
        c.mxValid = mx;
        if (mx === false) {
          c.status = "unverified"; // domain cannot receive mail
          c.confidence = 5;
          c.evidence = `${c.evidence ?? ""} (domain has no mail server)`.trim();
        }
      }
      checked.push(c);
    }
    if (deps.verifier) {
      let spent = 0;
      const worth = checked.filter((c) => c.kind === "founder" && c.email && c.mxValid === true && (c.status === "pattern_guessed" || c.status === "domain_valid_only") && c.source !== "hunter");
      for (const c of worth) {
        if (spent >= deps.config.maxVerificationsPerCompany) break;
        if (!(await deps.budget.consume(deps.verifier.name, deps.config.verifierMonthlyLimit))) {
          warnings.push(`${deps.verifier.name}: monthly verification budget exhausted`);
          break;
        }
        spent++;
        try {
          const verdict = await deps.verifier.verify(c.email!);
          if (verdict === "valid") {
            c.status = "provider_verified";
            c.confidence = 80;
            c.evidence = `${c.evidence ?? ""}; ${deps.verifier.name} reports the mailbox as valid`.trim();
          } else if (verdict === "invalid") {
            c.status = "unverified";
            c.confidence = 5;
            c.evidence = `${c.evidence ?? ""}; ${deps.verifier.name} reports the mailbox as invalid`.trim();
          } else if (verdict === "accept_all") {
            c.evidence = `${c.evidence ?? ""}; domain accepts all addresses, so the mailbox cannot be confirmed`.trim();
          }
        } catch (err) {
          warnings.push(`${deps.verifier.name}: ${err instanceof QuotaExhaustedError ? "quota exhausted" : errorMessage(err)}`);
          if (err instanceof QuotaExhaustedError) break;
        }
      }
    }

    // ── persist + choose the preferred contact ──
    const merged = mergeAll(existing, checked, nowIso);
    const roleByFounder = new Map(founders.map((f) => [f.name, f.role]));
    const pick = selectPreferred(merged.map((c) => ({ ...c, founderRole: c.founderName ? roleByFounder.get(c.founderName) ?? null : null })));
    const preferredKey = pick.contact ? contactKey(pick.contact) : null;
    for (const c of merged) c.isPreferred = preferredKey != null && contactKey(c) === preferredKey;
    await deps.store.saveContacts(startupId, merged);
    await deps.store.setPreferred(startupId, preferredKey);

    const status: ContactOutcome["status"] = pick.contact ? "completed" : attempted > 0 && errored === attempted ? "failed" : "not_found";
    await deps.store.updateStartup(startupId, {
      status,
      checkedAt: nowIso,
      error: status === "failed" ? warnings.join(" | ").slice(0, 800) : null,
    });
    if (pick.contact?.email && OUTREACH_SAFE.has(pick.contact.status)) {
      await deps.store.applyRecipientToOpenDrafts(startupId, pick.contact.kind === "founder" ? pick.contact.founderName : null, pick.contact.email);
    }
    const outcome: ContactOutcome = {
      startupId, status, preferredType: pick.type, preferredEmail: pick.contact?.email ?? null,
      founderEmails: merged.filter((c) => c.kind === "founder" && c.email && confirmed(c)).length,
      companyEmails: merged.filter((c) => c.kind === "company" && c.email).length,
      warnings,
    };
    await deps.log?.("contacts_enriched", `${startup.name}: ${status} (${pick.type})`, { founderEmails: outcome.founderEmails, companyEmails: outcome.companyEmails, preferredType: pick.type, warnings });
    return outcome;
  } catch (err) {
    const message = errorMessage(err);
    await deps.store.updateStartup(startupId, { status: "failed", checkedAt: nowIso, error: message.slice(0, 800) }).catch(() => undefined);
    await deps.log?.("contacts_failed", `${startup.name}: ${message}`);
    return empty(startupId, "failed", { warnings: [...warnings, message] });
  }
}

/** Batch: bounded concurrency; one startup failing never fails the others. */
export async function enrichMany(deps: ContactDeps, startupIds: string[], opts: { concurrency?: number; force?: boolean; deadline?: number; onDone?: (o: ContactOutcome) => void } = {}): Promise<ContactOutcome[]> {
  return mapLimit(startupIds, opts.concurrency ?? 3, async (id) => {
    let outcome: ContactOutcome;
    if (opts.deadline && Date.now() > opts.deadline) outcome = empty(id, "skipped", { skippedReason: "deadline" });
    else {
      try {
        outcome = await enrichStartupContacts(deps, id, { force: opts.force });
      } catch (err) {
        outcome = empty(id, "failed", { warnings: [errorMessage(err)] });
      }
    }
    opts.onDone?.(outcome);
    return outcome;
  });
}
