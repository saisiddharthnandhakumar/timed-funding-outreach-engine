# Timed Funding Outreach Engine

Automated pipeline that finds **Indian pre-seed and seed funding announcements within hours of publication**, checks them against an accelerator's investment thesis, researches the qualifying startups, and prepares a **personalised outreach draft for human review**. Nothing is ever sent automatically.

> **Claude Code was used as a development environment/agent only. The deployed application's AI functionality uses Gemini Flash** (no Anthropic, OpenAI or other LLM APIs at runtime).

## Status

V1 code is complete (pipeline, schema, UI, tests). The Supabase schema has been applied and verified, and Gemini Flash (`gemini-3.8-flash`) structured output and Google Search grounding were checked live. A full live run (4 real sources → Gemini → Supabase) has been executed; see [`docs/live-test-report.md`](docs/live-test-report.md). In the strict 24-hour live window nothing qualified (none was invented); a clearly labelled replay of 5-day-old real articles exercised research, scoring and drafting end to end (2 of 7 eligible startups qualified).

**Live deployment:** https://timed-funding-outreach-engine.vercel.app (no login; public landing page at `/`, dashboard at `/dashboard`; scheduled runs via Vercel Cron daily at 09:00 IST and GitHub Actions every 2 hours; see "Running the pipeline").

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

Candidates evaluated and **rejected** (2026-10-12): Inc42 `/tag/funding/` feed (stale since 2023), Moneycontrol and Business Standard (HTTP 403 to bots — not bypassed), VCCircle (404/paywalled), ETtech general, Livemint, BusinessLine, TOI, TechCrunch India, Medianama, StartupTalky (0–4 funding stories per ~50 items, or stale), Google News search (links resolve to a JS page, not the article), PR Newswire (global noise).

New sources: insert an `rss`/`sitemap` row into `sources`, or implement `FundingSourceAdapter` (`src/lib/sources/types.ts`) and register it.

## AI pipeline (all Gemini Flash)

1. **Classifier/extractor** – is it a funding announcement, which company, Indian?, normalised stage, amount, investors.
2. **Profile synthesis** – structured research profile from fetched pages + Google-Search-grounded research; unknown = `null`.
3. **Fit assessment** – per-criterion scores against the active thesis. The application clamps scores to each criterion's weight, computes recency and stage points deterministically, and computes the total itself.
4. **Outreach generator** – only for startups that passed filters, dedup and the score threshold.

Funnel order keeps cost low: cheap age/keyword gates run *before* any model call; research runs only for candidates that survived every hard filter.

## Database

Migrations live in `supabase/migrations/` (version-controlled): `sources`, `funding_articles`, `startups`, `founders`, `funding_rounds`, `funding_round_sources`, `investors`, `funding_round_investors`, `accelerator_theses`, `scoring_criteria`, `fit_assessments`, `outreach`, `pipeline_runs`, `pipeline_events`, `ai_calls`, `pipeline_lock`. RLS is enabled on all tables with no policies (server-only access via the service-role key).

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

- **Dashboard button** – "Run pipeline now" (runs in the background).
- **CLI** – `npm run pipeline` (`-- --max=15 --source=inc42_buzz`) prints a per-article trace.
- **Scheduled — Vercel Cron (daily anchor).** The project intentionally runs on the **Vercel Hobby (free) plan**, which only allows daily cron jobs. `vercel.json` calls `GET /api/cron/pipeline` at 03:30 UTC (09:00 IST) with `Authorization: Bearer $CRON_SECRET` as a morning safety run.
- **Scheduled — GitHub Actions (two-hour cadence).** `.github/workflows/pipeline-cron.yml` calls the *same* endpoint every 2 hours. Set repo secrets `APP_URL` (deployment URL) and `CRON_SECRET`. GitHub scheduled workflows can occasionally start late or skip a slot; this is why the dashboard has a **Pipeline Health** card (last successful run, time since, expected cadence, Healthy / Delayed / Warning, latest failure).
- **Manual** — the dashboard button remains available whenever a run is needed immediately.
- **Overlapping runs are impossible.** Every trigger takes an atomic database lock (`acquire_pipeline_lock`). A trigger that finds a live lock returns `{"status":"skipped","reason":"already_running"}` without polling sources or calling Gemini. The lock is released after success or failure, expires by itself if a run dies, and runs left `running` after a crash are marked `failed` (`stale_run`).

## Live pipeline progress

The dashboard's **Pipeline progress** panel shows an overall bar and one bar per stage (discover, age/keyword gates, Gemini classification, hard filters & dedupe, research, fit scoring, contact discovery, drafts) with done/total counts, per-stage timing and a "Now:" line naming what the backend is doing (e.g. "Researching Nimbus AI"). The run writes its progress to `pipeline_runs.progress_json` (throttled to about one write per second); the page polls `/api/pipeline/progress` every 2 seconds while a run is active and every 15 seconds otherwise. Stages after classification grow as articles reach them, because the pipeline is a per-article funnel. Requires migration `20261012000007_pipeline_progress.sql`; without it the pipeline runs normally and the panel says progress is unavailable.

## Thesis configuration

Open **Thesis Settings** in the UI. Geography, stages, sectors, exclusions, business models, max age, minimum score, scoring weights (validated to total 100), recency bands, stage points and the natural-language thesis are all editable. Saving creates a **new thesis version** (atomic Postgres function) and activates it; the scorer reads the active row at scoring time, so no redeploy is needed. Each `fit_assessment` stores its `thesis_id`, `thesis_version` and a snapshot of the criteria used, so history never changes.

## Deduplication

- **Events:** startup identity = domain → normalised company name; round identity = startup + stage + date window (21 days) with an amount sanity check. Extra reports attach as `funding_round_sources`, preserving each source's `source_published_at` / `first_seen_at` for speed metrics.
- **Outreach:** a startup with any live outreach (generated, draft created, approved, sent) is rejected as `already_contacted`; additionally enforced by a partial unique index in Postgres.

## Founder contact discovery

After a startup qualifies (and before its draft is created) the pipeline looks for **publicly published** professional email addresses, founders first. It uses free sources only and needs no API key. Implemented in TypeScript (`src/lib/contacts/`) inside the existing Vercel/GitHub Actions flow; there is no separate worker.

Waterfall per startup (cheapest and most reliable first):

1. **Official website** – homepage + About/Team/Contact/Press pages (max 8, same domain, robots.txt respected, SSRF-guarded). Extracts `mailto:` links, visible text, bracket-obfuscated addresses, JSON-LD and Cloudflare-protected addresses. An address is tied to a founder only with evidence (schema.org Person, the founder's name beside it, or a mailbox name that matches on the company domain).
2. **GitHub public API** – a profile that voluntarily lists an email *and* is tied to the company (company field, website, bio or company-domain email); also the company org's public email.
3. **Google-grounded search** (Gemini free tier, monthly-budgeted) – cited pages are fetched and an address counts only if it literally appears on the page. Addresses the model merely mentions stay `unverified`.
4. **Pattern guesses** (`first@`, `first.last@`…) – stored for later, labelled `pattern_guessed`, **never used for outreach or drafts**.

Every address gets syntax + MX checks. Hunter (optional, free-tier `HUNTER_API_KEY`) can upgrade a guessed address to `provider_verified`.

| Status | Meaning |
|---|---|
| `publicly_confirmed` | Published by the company/person themselves, with evidence tying it to the founder/company |
| `provider_verified` | A verification provider reports the mailbox valid, with name attribution |
| `domain_valid_only` | Real address on a weakly-attributed page; the domain accepts mail (a valid MX does **not** prove a mailbox exists) |
| `pattern_guessed` | Generated by us; not published anywhere |
| `unverified` | Only in model text, or the domain has no mail server |

**Preferred contact (strict order):** publicly-confirmed founder email → provider-verified founder email → publicly-confirmed company email (partnerships/general before support) → public contact form → `not_found`. All founder emails are kept; unverified candidates are stored separately. Only `publicly_confirmed` / `provider_verified` addresses are ever prefilled as a draft's recipient. Results show on the **startup page** (copy buttons, source, evidence, status, last checked) and the **Qualified** table.

Re-running: *Re-run contact search* on the startup page, or `npm run contacts -- --startup=<uuid> [--force]` / `npm run contacts -- --all-qualified --limit=50`. Previously qualified startups with no result yet are backfilled automatically (up to `CONTACT_BACKFILL_PER_RUN` per pipeline run); results are cached for `CONTACT_REENRICH_DAYS` (default 14). Limits: 3 concurrent startups, 8 pages each, retries with backoff and jitter, a per-host delay, monthly budgets for the search and verifier calls. One failing startup never fails the batch.

Requires migration `supabase/migrations/20261012000006_contact_enrichment.sql` (apply it **before** deploying). Optional env vars: `GITHUB_TOKEN`, `HUNTER_API_KEY`, `CONTACT_*` (see `.env.example`). No new GitHub Actions secrets are needed: the existing 2-hourly workflow already triggers the pipeline.

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
