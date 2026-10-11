# Timed Funding Outreach Engine

Automated pipeline that finds **Indian pre-seed and seed funding announcements within hours of publication**, checks them against an accelerator's investment thesis, researches the qualifying startups, and prepares a **personalised outreach draft for human review**. Nothing is ever sent automatically.

> **Claude Code was used as a development environment/agent only. The deployed application's AI functionality uses Gemini Flash** (no Anthropic, OpenAI or other LLM APIs at runtime).

## Status

V1 code is complete (pipeline, schema, UI, tests). The Supabase schema has been applied and verified, and Gemini Flash (`gemini-3.8-flash`) structured output and Google Search grounding were checked live. A full live run (4 real sources → Gemini → Supabase) has been executed; see [`docs/live-test-report.md`](docs/live-test-report.md). In the strict 24-hour live window nothing qualified (none was invented); a clearly labelled replay of 5-day-old real articles exercised research, scoring and drafting end to end (2 of 7 eligible startups qualified).

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

New sources: insert an `rss`/`sitemap` row into `sources`, or implement `FundingSourceAdapter` (`src/lib/sources/types.ts`) and register it.

## AI pipeline (all Gemini Flash)

1. **Classifier/extractor** – is it a funding announcement, which company, Indian?, normalised stage, amount, investors.
2. **Profile synthesis** – structured research profile from fetched pages + Google-Search-grounded research; unknown = `null`.
3. **Fit assessment** – per-criterion scores against the active thesis. The application clamps scores to each criterion's weight, computes recency and stage points deterministically, and computes the total itself.
4. **Outreach generator** – only for startups that passed filters, dedup and the score threshold.

Funnel order keeps cost low: cheap age/keyword gates run *before* any model call; research runs only for candidates that survived every hard filter.

## Database

Migrations live in `supabase/migrations/` (version-controlled): `sources`, `funding_articles`, `startups`, `founders`, `funding_rounds`, `funding_round_sources`, `investors`, `funding_round_investors`, `accelerator_theses`, `scoring_criteria`, `fit_assessments`, `outreach`, `pipeline_runs`, `pipeline_events`, `ai_calls`. RLS is enabled on all tables with no policies (server-only access via the service-role key).

## Setup

```bash
npm install
cp .env.example .env.local     # fill in values (see below)
npm run db:migrate             # applies supabase/migrations via SUPABASE_DB_URL
npm run gemini:models          # lists Flash models for your key → set GEMINI_MODEL
npm run dev                    # http://localhost:3000
```

### Environment variables

All documented in [`.env.example`](.env.example): `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_DB_URL`, `GOOGLE_GENERATIVE_AI_API_KEY`, `GEMINI_MODEL` (no default — you choose), `ADMIN_PASSWORD`, `CRON_SECRET`, optional Gmail OAuth (`GOOGLE_CLIENT_ID/SECRET/REFRESH_TOKEN`), and pipeline tuning knobs.

## Running the pipeline

- **Dashboard button** – "Run pipeline now" (admin only; runs in the background).
- **CLI** – `npm run pipeline` (`-- --max=15 --source=inc42_buzz`) prints a per-article trace.
- **Scheduled** – `vercel.json` calls `GET /api/cron/pipeline` every 2 hours with `Authorization: Bearer $CRON_SECRET`. On Vercel Hobby (daily-only cron) remove the `crons` entry and use `.github/workflows/pipeline-cron.yml` (secrets `APP_URL`, `CRON_SECRET`).

## Thesis configuration

Open **Thesis Settings** in the UI. Geography, stages, sectors, exclusions, business models, max age, minimum score, scoring weights (validated to total 100), recency bands, stage points and the natural-language thesis are all editable. Saving creates a **new thesis version** (atomic Postgres function) and activates it; the scorer reads the active row at scoring time, so no redeploy is needed. Each `fit_assessment` stores its `thesis_id`, `thesis_version` and a snapshot of the criteria used, so history never changes.

## Deduplication

- **Events:** startup identity = domain → normalised company name; round identity = startup + stage + date window (21 days) with an amount sanity check. Extra reports attach as `funding_round_sources`, preserving each source's `source_published_at` / `first_seen_at` for speed metrics.
- **Outreach:** a startup with any live outreach (generated, draft created, approved, sent) is rejected as `already_contacted`; additionally enforced by a partial unique index in Postgres.

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
3. Deploy. The cron in `vercel.json` activates on plans that allow sub-daily crons.

## Limitations

- The strict live 24-hour run found no qualifying announcement at test time; full-funnel results come from a labelled replay (see the live-test report).
- Drafts are created in Supabase only until Gmail OAuth credentials are configured.
- Multi-company roundup articles ("Funding Wrap") are skipped; only single-company announcements are processed.
- Founder emails are not discovered; drafts have no recipient address until the operator adds one.
- Ambiguous entity matching is deterministic only (no Gemini-assisted fuzzy matching).
- Single shared admin password, no per-user accounts.
- Research depends on publicly reachable pages; paywalled/blocked sites yield less evidence (recorded as unknown).

## Future improvements

Gemini-assisted entity matching, roundup splitting, Google/news-search and VCCircle/ETtech adapters, investor-portfolio feeds, founder contact discovery, follow-up sequences, per-user auth, source-speed analytics dashboards.
