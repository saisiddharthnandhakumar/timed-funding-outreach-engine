# Timed Funding Outreach Engine

Automated pipeline that finds **Indian pre-seed and seed funding announcements within hours of publication**, checks them against an accelerator's investment thesis, researches the qualifying startups, and prepares a **personalised outreach draft for human review**. Nothing is ever sent automatically.

> **Claude Code was used as a development environment/agent only. The deployed application's AI functionality uses Gemini Flash** (no Anthropic, OpenAI or other LLM APIs at runtime).

## Status

V1 code is complete (pipeline, schema, UI, tests). The Supabase schema has been applied and verified, and Gemini Flash (`gemini-3.8-flash`) structured output and Google Search grounding were checked live. A full live run (4 real sources → Gemini → Supabase) has been executed; see [`docs/live-test-report.md`](docs/live-test-report.md). In the strict 24-hour live window nothing qualified (none was invented); a clearly labelled replay of 5-day-old real articles exercised research, scoring and drafting end to end (2 of 7 eligible startups qualified).

**Live deployment:** https://timed-funding-outreach-engine.vercel.app (no login; public landing page at `/`, the app at `/today`; scheduled runs via Vercel Cron daily at 09:00 IST and GitHub Actions every 2 hours; see "Running the pipeline").

## Using the app

Four destinations: **Today** (morning briefing: what needs attention, drafts ready, one-line system health, a 24-hour funnel from articles scanned to drafts, and a **Scan now** button that shows the scan live while it runs), **Opportunities** (the work queue: *Active* qualified startups, *Discoveries* for the broader funding feed), **Drafts** (review queue and review view) and **Settings** (Investment Thesis, Sources, Integrations, System). ⌘K (or Ctrl+K) searches startups, founders and sectors. Pipeline internals, raw timestamps, rejection codes and model metadata are deliberately a click or two deeper: startup page → *Sources & evidence* / *Technical details*, and Settings → System. Old URLs (`/dashboard`, `/feed`, `/qualified`, `/sources`, `/settings/discovery`, `/startups/:id`) redirect. Design notes: [`docs/ui-redesign-plan.md`](docs/ui-redesign-plan.md).

## Problem

Rohit recruits for an early-stage accelerator. Manually watching startup-news sites, logging deals in a spreadsheet, researching each startup and writing outreach is slow and misses announcements. The goal: each morning, personalised drafts are waiting for startups that announced funding recently, fit the thesis, and haven't been contacted. Poor-fit startups need no manual review.

## Architecture

See [`docs/components-map.md`](docs/components-map.md) for the full Mermaid diagram and component inventory.

```
Funding sources → adapters → ingestion (funding_articles)
 → cheap gates (age, keywords) → Gemini classifier → hard filters
 → deduplication → already-contacted check → research → Gemini profile
 → active thesis (Supabase) → Gemini fit scoring → app-side validation
 → qualified? → Gemini outreach → draft provider → human review
```

**Tech stack:** Next.js 16 (App Router) · TypeScript · Tailwind CSS 4 · Supabase (Postgres) · Gemini Flash via `@google/genai` · Vitest · Vercel Cron.

## Funding sources (integrated)

| Source | Mechanism |
|---|---|
| ET Entrepreneur — Funding | RSS (`/rss/funding`) |
| Inc42 — Buzz | RSS (`/buzz/feed/`) |
| YourStory | RSS (`/feed`) |
| Entrackr | Google-News sitemap (`/news-sitemap.xml`, allowed by its robots.txt; no RSS exists) |
| ET Startups (ETtech) | RSS (`/tech/startups/rssfeeds/78570550.cms`) — added 2026-10-12; ~37 of 50 headlines are funding stories and it surfaces deals the other four miss |
| Mint — Start-ups *(secondary)* | Start-ups section page (`/companies/start-ups`): JSON-LD item list + article cards, dated from Mint's article id (added 2026-10-13). Mint's RSS is general business news, so it is not used |

Investor websites are a separate kind of source — see [Investor sources and evidence](#investor-sources-and-evidence).

Candidates evaluated and **rejected** (2026-10-12): Inc42 `/tag/funding/` feed (stale since 2023), Moneycontrol and Business Standard (HTTP 403 to bots — not bypassed), VCCircle (404/paywalled), ETtech general, Livemint, BusinessLine, TOI, TechCrunch India, Medianama, StartupTalky (0–4 funding stories per ~50 items, or stale), Google News search (links resolve to a JS page, not the article), PR Newswire (global noise).

New news sources: insert an `rss`/`sitemap` row into `sources`, or implement `FundingSourceAdapter` (`src/lib/sources/types.ts`) and register it.

**Checked 2026-10-13 and not added:** Business Standard and Moneycontrol (HTTP 403 bot protection on every feed/page; not bypassed), Financial Express (RSS switched off; its news sitemap is general business news with almost no startup funding and would flood the filtered list). They are recorded in `sources` as disabled with the reason, and show as "Not available" in Settings → Sources.

## Investor sources and evidence

The source layer separates **discovery** ("a funding event happened") from **enrichment / verification** ("who are the founders, what sector, what stage did the investor enter at"). `sources` carries `source_type` (`news` · `investor` · `company` · `database` · `search`), `source_role` (`discovery` · `enrichment` · `verification`), `adapter_status` (`verified` · `unverified` · `unsupported`), a `status_note` and a `config_json` (tier, window, page budget, cache TTL). A source can only be switched on once its adapter is `verified`.

| Investor | Discovery | Enrichment (portfolio page) | Notes |
|---|---|---|---|
| Blume Ventures | "Why we invested / investing in" commentaries (JSON-LD dates) | sector, location, partnered year, website, founders | homepage sits behind a Cloudflare challenge and is never fetched; sitemaps, commentaries and startup pages are served normally |
| Stellaris Venture Partners | funding news + "why we invested" posts from `/insights` | entry stage, partnered year, founders, co-investors, website | `/insights` is ~2.6 MB, so this site raises the fetch cap to 4 MB |
| Elevation Capital | `investing-in-*` posts (dated via `__NEXT_DATA__`) | stage invested, sector, website, founders | posts a few times a year; sitemap has no dates, so discovery samples a few unseen posts per run |
| Nexus Venture Partners | — (no news surface) | sector, location, status, website, founders | India mirror pages carry no announcements |
| Peak XV Partners | investment posts from the `/insights` index (rare) | sector, current stage, first-partnered year, website, founders | enrichment-first; never the fastest trigger |
| 3one4 Capital *(secondary)* | strict funding-post filter on `/blog` | sector, website, founders, co-investors | |
| India Quotient *(secondary)* | — | website, sector, founders from the one `/portfolio` page | company name is the slug (no display name published) |
| Antler India *(secondary)* | — | **unsupported**: company pages are disallowed by robots.txt | |

How it fits the pipeline (`src/lib/investors/`):

- **Discovery** — an investor's recent posts become normal `funding_articles` through the existing `FundingSourceAdapter` path (`InvestorDiscoveryAdapter`), so classification, hard filters and de-duplication are unchanged. One investor post and one news article about the same raise become **one** startup and **one** round with two `funding_round_sources`. Each adapter fails alone: an error is recorded against that source and the run continues. Only posts inside `window_days` are read (no historical backfill) and URLs already stored are skipped.
- **Enrichment** — after a startup survives the hard filters, `InvestorEnricher` looks it up in each enabled, verified investor source that has the enrichment role (slug/name/domain match; a miss costs no page fetch). Found portfolio facts are cached in `investor_portfolio_entries` for `ttl_days` (default 14), offered to research synthesis as a first-party document, and merged **fill-only**: null fields are filled, existing research values are never overwritten, geography (`hq_country`/`hq_city`) is never filled from investor data. Wired in explicitly by the three production entry points (`PipelineDeps.investorLookup`), so tests stay hermetic.
- **Evidence** — `research_evidence` stores one row per fact and source with an evidence type (`company_first_party`, `investor_first_party`, `reputable_media`, `database`, `search_result`; first-party outranks media outranks database outranks search), a confidence (`high` only when sources agree; `low` for search results or conflicts), and `conflict_json` when sources disagree (website, founders, or a funding amount differing by more than ~3%, e.g. $3M vs $3.2M). Conflicts also appear as `evidence_conflict` pipeline events and under the startup page → Technical details → Evidence. An investor announcing its own investment sets `funding_round_investors.confirmed_by_investor_site`.
- **Not fit.** Investor data improves research completeness and data confidence only. The fit-score formula, thesis, hard filters and outreach logic are untouched; being backed by a given investor earns no points.

Adding an investor: write an `InvestorSite` in `src/lib/investors/sites/` (only fetch through `ctx.fetch`; return null/empty rather than guess), list it in `src/lib/investors/registry.ts`, add a `sources` row (`source_type='investor'`, `type='scrape'`), verify it live, then set `adapter_status='verified'`.

Known limitations: investor sites publish few announcements (a few a quarter each), so most polls find nothing new; their portfolio pages rarely state a funding stage; parsers depend on each site's current markup (a redesign makes a site return nothing, never wrong data); Gemini is not used by any investor adapter.

## AI pipeline (all Gemini Flash)

1. **Classifier/extractor** – is it a funding announcement, which company, Indian?, normalised stage, amount, investors.
2. **Profile synthesis** – structured research profile from fetched pages + Google-Search-grounded research; unknown = `null`.
3. **Fit assessment** – per-criterion scores against the active thesis. The application clamps scores to each criterion's weight, computes recency and stage points deterministically, and computes the total itself.
4. **Outreach generator** – only for startups that passed filters, dedup and the score threshold.

Funnel order keeps cost low: cheap age/keyword gates run *before* any model call; research runs only for candidates that survived every hard filter.

### Backup AI (OpenRouter, optional)

Runtime AI is Gemini Flash. If `OPENROUTER_API_KEY` is set, requests that Gemini cannot serve (HTTP 429 quota, 500/502/503/504) are retried on OpenRouter, routed to `OPENROUTER_MODEL` (default `google/gemini-3.8-flash`) with OpenRouter's web search for grounded research. After a 429 the primary is skipped for 10 minutes; a bad request or invalid output never triggers the backup. Without the key nothing changes. Code: `src/lib/gemini/fallback.ts`, `openrouter.ts`; wired in `src/lib/ai.ts`. The key is only sent as a bearer header.

## Database

Migrations live in `supabase/migrations/` (version-controlled): `sources`, `funding_articles`, `startups`, `founders`, `funding_rounds`, `funding_round_sources`, `investors`, `funding_round_investors`, `accelerator_theses`, `scoring_criteria`, `fit_assessments`, `outreach`, `pipeline_runs`, `pipeline_events`, `ai_calls`, `pipeline_lock`, `research_evidence`, `investor_portfolio_entries` (the last two and the new `sources` columns are additive: migrations `20261013000001`–`3`). RLS is enabled on all tables with no policies (server-only access via the service-role key).

## Setup

```bash
npm install
cp .env.example .env.local     # fill in values (see below)
npm run db:migrate             # applies supabase/migrations via SUPABASE_DB_URL
npm run gemini:models          # lists Flash models for your key → set GEMINI_MODEL
npm run dev                    # http://localhost:3000
```

### Environment variables

All documented in [`.env.example`](.env.example): `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_DB_URL`, `GOOGLE_GENERATIVE_AI_API_KEY`, `GEMINI_MODEL` (no default — you choose), `CRON_SECRET`, optional Gmail OAuth (`GOOGLE_CLIENT_ID/SECRET/REFRESH_TOKEN`), and pipeline tuning knobs.

## Running the pipeline

- **Settings → System** – "Run pipeline now" (runs in the background); "Scan now" is also in the system-health sheet.
- **CLI** – `npm run pipeline` (`-- --max=15 --source=inc42_buzz`) prints a per-article trace.
- **Scheduled — Vercel Cron (daily anchor).** The project intentionally runs on the **Vercel Hobby (free) plan**, which only allows daily cron jobs. `vercel.json` calls `GET /api/cron/pipeline` at 03:30 UTC (09:00 IST) with `Authorization: Bearer $CRON_SECRET` as a morning safety run.
- **Scheduled — GitHub Actions (two-hour cadence).** `.github/workflows/pipeline-cron.yml` calls the *same* endpoint every 2 hours. Set repo secrets `APP_URL` (deployment URL) and `CRON_SECRET`. GitHub scheduled workflows can occasionally start late or skip a slot; this is why the app shows a one-line system health indicator ("System healthy · Last scan 37m ago", "Scan delayed · Last success 4h ago", "Discovery issue · Last success 8h ago"). Click it for last and next run, source health, latest error and the Vercel / GitHub schedules.
- **Manual** — Settings → System remains available whenever a run is needed immediately.
- **Overlapping runs are impossible.** Every trigger takes an atomic database lock (`acquire_pipeline_lock`). A trigger that finds a live lock returns `{"status":"skipped","reason":"already_running"}` without polling sources or calling Gemini. The lock is released after success or failure, expires by itself if a run dies, and runs left `running` after a crash are marked `failed` (`stale_run`).

## Live pipeline progress

**Settings → System → Pipeline details** shows an overall bar and one bar per stage (discover, age/keyword gates, Gemini classification, hard filters & dedupe, research, fit scoring, contact discovery, drafts) with done/total counts, per-stage timing and a "Now:" line naming what the backend is doing (e.g. "Researching Nimbus AI"). Wherever a scan is started from the UI, a friendlier five-phase status ("Scanning sources…", "Reviewing funding announcements…", "Researching candidates…", "Scoring fit…", "Preparing drafts…") is shown instead of internal stage names. The run writes its progress to `pipeline_runs.progress_json` (throttled to about one write per second); the page polls `/api/pipeline/progress` every 2 seconds while a run is active and every 15 seconds otherwise. Stages after classification grow as articles reach them, because the pipeline is a per-article funnel. Requires migration `20261012000007_pipeline_progress.sql`; without it the pipeline runs normally and the panel says progress is unavailable.

## Thesis configuration

Open **Settings → Investment Thesis**. The essentials are up front: the natural-language thesis, target geography, funding stages (Pre-seed and Seed shown; "+ Add stage" for the rest), focus sectors, minimum fit score and maximum announcement age. Preferred subsectors are summarised ("Vertical AI · Enterprise AI · Agentic Workflows +8 more") and edited on demand; excluded areas and business models sit under *More preferences*; scoring weights (validated to total 100), recency bands, stage points and criterion descriptions sit under *Advanced scoring*; *View version history* lists every saved version. Saving creates a **new thesis version** (atomic Postgres function) and activates it; the scorer reads the active row at scoring time, so no redeploy is needed. Each `fit_assessment` stores its `thesis_id`, `thesis_version` and a snapshot of the criteria used, so history never changes.

## Deduplication

- **Events:** startup identity = domain → normalised company name; round identity = startup + stage + date window (21 days) with an amount sanity check. Extra reports attach as `funding_round_sources`, preserving each source's `source_published_at` / `first_seen_at` for speed metrics.
- **Outreach:** a startup with any live outreach (generated, draft created, approved, sent) is rejected as `already_contacted`; additionally enforced by a partial unique index in Postgres.

## Founder contact discovery

After a startup qualifies (and before its draft is created) the pipeline looks for **publicly published** professional email addresses, founders first. It uses free sources only and needs no API key. Implemented in TypeScript (`src/lib/contacts/`) inside the existing Vercel/GitHub Actions flow; there is no separate worker.

Waterfall per startup (cheapest and most reliable first):

1. **Official website** – homepage + About/Team/Contact/Press pages (max 8, same domain, robots.txt respected, SSRF-guarded). Extracts `mailto:` links, visible text, bracket-obfuscated addresses, JSON-LD and Cloudflare-protected addresses. An address is tied to a founder only with evidence (schema.org Person, the founder's name beside it, or a mailbox name that matches on the company domain).
2. **GitHub public API** – a profile that voluntarily lists an email *and* is tied to the company (company field, website, bio or company-domain email); also the company org's public email.
3. **Google-grounded search** (Gemini free tier, monthly-budgeted) – cited pages are fetched and an address counts only if it literally appears on the page. Addresses the model merely mentions stay `unverified`.
4. **Hunter Email Finder** (optional, `HUNTER_API_KEY`) – for each founder that steps 1–3 left without a confirmed address, asks Hunter for their work email at the company domain. Only a mailbox Hunter reports as `valid` becomes `provider_verified` (and may prefill a draft); `accept_all` / unknown answers are stored as `domain_valid_only` and never used. One credit per lookup (Hunter charges nothing when it finds no address), capped by `CONTACT_HUNTER_FINDER_MONTHLY_BUDGET` (default 20) so the free plan is never exceeded. See [Hunter setup](#hunter-founder-emails).
5. **Pattern guesses** (`first@`, `first.last@`…) – stored for later, labelled `pattern_guessed`, **never used for outreach or drafts**.

Every address gets syntax + MX checks. Hunter's verifier (same key, `CONTACT_VERIFIER_MONTHLY_BUDGET`) can additionally upgrade a guessed address to `provider_verified`.

| Status | Meaning |
|---|---|
| `publicly_confirmed` | Published by the company/person themselves, with evidence tying it to the founder/company |
| `provider_verified` | A verification provider reports the mailbox valid, with name attribution |
| `domain_valid_only` | Real address on a weakly-attributed page; the domain accepts mail (a valid MX does **not** prove a mailbox exists) |
| `pattern_guessed` | Generated by us; not published anywhere |
| `unverified` | Only in model text, or the domain has no mail server |

**Preferred contact (strict order):** publicly-confirmed founder email → provider-verified founder email → publicly-confirmed company email (partnerships/general before support) → public contact form → `not_found`. All founder emails are kept; unverified candidates are stored separately. Only `publicly_confirmed` / `provider_verified` addresses are ever prefilled as a draft's recipient. Results show on the **startup page** (copy buttons, source, evidence, status, last checked) and in the Opportunities list.

Re-running: *Re-run contact search* on the startup page, or `npm run contacts -- --startup=<uuid> [--force]` / `npm run contacts -- --all-qualified --limit=50`. Previously qualified startups with no result yet are backfilled automatically (up to `CONTACT_BACKFILL_PER_RUN` per pipeline run); results are cached for `CONTACT_REENRICH_DAYS` (default 14). Limits: 3 concurrent startups, 8 pages each, retries with backoff and jitter, a per-host delay, monthly budgets for the search and verifier calls. One failing startup never fails the batch.

Requires migration `supabase/migrations/20261012000006_contact_enrichment.sql` (apply it **before** deploying). Optional env vars: `GITHUB_TOKEN`, `HUNTER_API_KEY`, `CONTACT_*` (see `.env.example`). No new GitHub Actions secrets are needed: the existing 2-hourly workflow already triggers the pipeline.

### Hunter (founder emails)

1. Create a free account at [hunter.io](https://hunter.io), then open **API** in the dashboard and copy your key.
2. Put it in `.env.local` as `HUNTER_API_KEY=...` and in Vercel (Project → Settings → Environment Variables, Production). Redeploy.
3. Apply `supabase/migrations/20261012000008_hunter_contact_source.sql` (lets a contact be stored with source `hunter`). Nothing else changes in the database.
4. Check **Settings → Integrations → Founder emails (Hunter)** says *Connected*. Re-run a startup's contact search (startup page → *Re-run contact search*, or `npm run contacts -- --startup=<uuid> --force`) and the new contact appears with source *Hunter* and its score in the evidence column.

Hunter only helps when the app knows a founder's **full name** and the company's **website domain**; the key is sent as an `X-API-KEY` header, never in a URL. Check usage in Hunter's dashboard; the app also self-limits (`CONTACT_HUNTER_FINDER_MONTHLY_BUDGET`, `CONTACT_VERIFIER_MONTHLY_BUDGET`). Code: `src/lib/contacts/hunter.ts`, wired in `src/lib/contacts/pipeline.ts` (step D).

## Telegram alerts

Tells the scout, in Telegram, when:

1. **A startup has been found and its email drafted** (sent as soon as the draft exists: name, stage and amount, fit score, who the draft is addressed to, how much of the 24-hour window is left, and a link to the draft).
2. **Time is running out**: one message **2 hours before** the 24-hour outreach window closes, for any draft that has not gone out (status *generated*, *draft created* or *approved*; a sent or rejected draft is never reminded). The window runs from the funding announcement, the same clock the pipeline uses to decide a startup is still timely.

Each alert is sent **at most once per draft** (an atomic claim row in `pipeline_events`, unique index from `20261012000009_telegram_once_per_draft.sql`); a failed send is retried by the next sweep. Telegram being down or unconfigured never fails a pipeline run.

**Setup**

1. In Telegram open **@BotFather** → `/newbot` → pick a name → copy the token.
2. Open your new bot and press **Start** (a bot cannot message you until you do). For a group, add the bot to the group and send a message there.
3. Put the token in `.env.local` as `TELEGRAM_BOT_TOKEN`, run `npm run telegram`: it prints `TELEGRAM_CHAT_ID=...`; add that too. Also set `APP_URL` (your deployed URL) so alerts link to the draft.
4. `npm run telegram -- --test` sends a test message.
5. Add the same three variables in Vercel (Production) and redeploy. Apply the migration above.
6. For the **2-hour reminder**: the workflow `.github/workflows/telegram-reminders.yml` calls `/api/cron/reminders` every 10 minutes (Vercel Hobby cron only runs daily). It uses the same repo secrets as the pipeline workflow, `APP_URL` and `CRON_SECRET`. Every pipeline run also checks reminders at its end.

GitHub may start a scheduled run a few minutes late, so the reminder lands *about* 2 hours before the window closes (never later than the window itself). Tunables: `OUTREACH_WINDOW_HOURS` (24), `TELEGRAM_REMINDER_LEAD_HOURS` (2). Code: `src/lib/telegram/`.

## Sending email (Resend, human-triggered)

Each approved draft on the **Drafts** page has a **Send email** button. Sending is never automatic: nothing in the pipeline calls it, and every send needs your click plus a confirmation dialog showing the To and From addresses.

Rules enforced in code (`src/lib/outreach/send.ts`):
- Only a draft in status `approved` can be sent; `sent` drafts can never be sent again.
- A valid recipient email is required. If the address is a known discovered contact, it must be `publicly_confirmed` or `provider_verified`; guessed (`pattern_guessed`), `domain_valid_only` and `unverified` addresses are refused. An address you typed in yourself is allowed, because that is your own decision.
- Resend's `Idempotency-Key` (draft id + content hash) means a double-click or a retry after a timeout cannot deliver the email twice. A failed send leaves the draft `approved` and shows Resend's error.
- Every send / failure is logged in `pipeline_events` (`email_sent`, `email_send_failed`) with the Resend message id.

Setup: verify your domain in Resend, then set `RESEND_API_KEY`, `RESEND_FROM_EMAIL` (an address on the verified domain), and optionally `RESEND_FROM_NAME` and `RESEND_REPLY_TO`. The sender is currently `rohit@wakeandwyze.com` with replies to `hello@wakeandwyze.com`. The email goes out as plain text exactly as saved on the draft (save edits first). The app adds no unsubscribe footer; include your own sign-off and opt-out wording in the draft, and check local anti-spam and data-protection rules before sending at volume.

## Gmail drafts

If the three Google OAuth variables are set, drafts are created via `users.drafts.create` (scope `gmail.compose`; the code has no send path). Otherwise drafts are stored in Supabase and reviewed in the **Drafts** page. Gmail is never faked.

## Tests

```bash
npm run lint && npm run typecheck && npm test && npm run build
```

Unit tests cover hard filters, deduplication, outreach duplication, score validation and thesis changes. Integration tests (`tests/integration/`) run against Supabase using a **fixture** source and a fake AI (synthetic data, cleaned up afterwards — never presented as live results); they skip automatically without credentials.

## Deploy to Vercel

1. Import the GitHub repo into Vercel.
2. Add the environment variables from `.env.example` (never commit real values).
3. Deploy. `vercel.json` registers the daily cron (Hobby plan); add the GitHub Actions secrets above for 2-hourly runs. Apply all migrations (including `20261012000005_pipeline_run_lock.sql`) to Supabase **before** deploying this version; runs fail without the lock functions.

Helper: after `vercel login && vercel link`, `bash scripts/push-env-to-vercel.sh` copies the variables from `.env.local` to the Vercel project (production) without printing them.

## Limitations

- GitHub Actions schedules are best-effort and may run late; the daily Vercel run is only a backup, not a second 2-hour trigger.
- The strict live 24-hour run found no qualifying announcement at test time; full-funnel results come from a labelled replay (see the live-test report).
- Drafts are created in Supabase only until Gmail OAuth credentials are configured.
- Multi-company roundup articles ("Funding Wrap") are skipped; only single-company announcements are processed.
- Founder emails are only found when they are **publicly published** (company site, GitHub, cited web pages). Many early-stage founders publish none, so some drafts will have no recipient (or only a company/contact-form fallback) and need a manual address. Mailbox existence is never guaranteed; the app does not probe mail servers. LinkedIn is not scraped; a founder LinkedIn URL is shown only if it appeared in research.
- Contact discovery reads static HTML only (no JavaScript-rendered pages). The app has no CSV export, so there is nothing to extend there yet.
- Ambiguous entity matching is deterministic only (no Gemini-assisted fuzzy matching).
- **No authentication.** The password gate was removed by request: anyone with the URL can read data, edit the thesis, change draft status and trigger runs (each run spends Gemini quota; overlapping runs are blocked by the run lock). Only `/api/cron/pipeline` still needs `CRON_SECRET`. Re-add auth before sharing the URL widely or storing real contact data.
- No per-user accounts.
- Research depends on publicly reachable pages; paywalled/blocked sites yield less evidence (recorded as unknown).

## Future improvements

Gemini-assisted entity matching, roundup splitting, Google/news-search and VCCircle/ETtech adapters, investor-portfolio feeds, founder contact discovery, follow-up sequences, per-user auth, source-speed analytics dashboards.
