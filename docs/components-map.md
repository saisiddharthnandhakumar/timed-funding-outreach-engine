# Components Map

## End-to-end flow

```mermaid
flowchart TD
    FS["Funding sources<br/>ET Entrepreneur RSS · Inc42 Buzz RSS · YourStory RSS · Entrackr news sitemap"] --> SA["Source adapters<br/>(FundingSourceAdapter: RssAdapter, NewsSitemapAdapter)"]
    SA --> ING["Ingestion<br/>canonical URL, source_published_at, first_seen_at<br/>idempotent upsert"]
    ING --> RAW[("Supabase: funding_articles<br/>raw articles + timestamps")]
    RAW --> CHEAP{"Cheap gates (no AI)<br/>age &gt; max hours?<br/>funding keywords?"}
    CHEAP -- fail --> REJ1["article rejected<br/>announcement_too_old / not_funding_announcement"]
    CHEAP -- pass --> TXT["Fetch article text<br/>(SSRF-safe fetch)"]
    TXT --> CLS["Gemini Flash — Task 1<br/>Funding classifier + extraction"]
    CLS --> HF{"Hard filters (deterministic)<br/>India · pre-seed/seed · ≤24h"}
    HF -- fail --> REJ2["rejected + reason<br/>wrong_geography / wrong_stage / announcement_too_old"]
    HF -- pass --> DD["Deduplication<br/>domain → normalised name → stage+date window"]
    DD -- "existing round" --> ATT["attach as another funding_round_source<br/>(timings preserved per source)"]
    DD -- "new round" --> OC{"Already contacted?<br/>(outreach history)"}
    OC -- yes --> REJ3["rejected: already_contacted"]
    OC -- no --> RES["Research / enrichment<br/>article text · company website · Gemini+Google Search grounding"]
    RES --> PRO["Gemini Flash — Task 2<br/>Startup profile synthesis"]
    PRO --> TH[("Supabase: accelerator_theses<br/>+ scoring_criteria (ACTIVE version)")]
    TH --> FIT["Gemini Flash — Task 3<br/>Fit assessment (per-criterion)"]
    FIT --> VAL["App-side validation<br/>clamp to weights · recency & stage computed in code · total in code"]
    VAL --> Q{"score ≥ minimum_fit_score?"}
    Q -- no --> REJ4["rejected: below_threshold<br/>(assessment stored)"]
    Q -- yes --> OUT["Gemini Flash — Task 4<br/>Personalised outreach generator"]
    OUT --> DP["Draft provider<br/>Gmail draft (if OAuth) · else Supabase-only"]
    DP --> OST[("Supabase: outreach<br/>unique live outreach per startup")]
    OST --> HR["Human review in the Drafts UI<br/>(never auto-sent)"]
```

## Frontend components (Next.js App Router, `src/app`)

| Route | Purpose | Key file |
|---|---|---|
| `/` | Dashboard: 24h stats, avg ingestion delay, pipeline status, "Run pipeline now" | `app/page.tsx`, `components/run-pipeline-button.tsx` |
| `/dashboard` | Counts, pipeline health, last run, recent events, "Run pipeline now" | `app/(app)/dashboard/page.tsx` |
| `/feed` | Funding events with every source report (published → first seen) + filtered-out articles | `app/(app)/feed/page.tsx` |
| `/qualified` | Qualified startups, score, top reasons, research + draft status | `app/(app)/qualified/page.tsx` |
| `/startups/[id]` | Profile, founders, rounds, source articles, research evidence, fit breakdown, outreach | `app/(app)/startups/[id]/page.tsx` |
| `/drafts` | Review/edit/approve/reject drafts; mark as sent manually | `app/(app)/drafts/page.tsx`, `actions.ts` |
| `/settings` | Thesis editor (versioned), weights (sum = 100), recency bands, stage points | `app/(app)/settings/page.tsx`, `components/thesis-form.tsx` |
| `/sources` | Source health + speed metrics (delay, wins, unique discoveries) | `app/(app)/sources/page.tsx` |
| `/` | Public landing page (product explainer, live headline numbers, link to the dashboard) | `app/page.tsx` |

## Backend components (`src/lib`)

| Module | Responsibility |
|---|---|
| `sources/` | `FundingSourceAdapter` interface, RSS + news-sitemap adapters, registry, article text extraction |
| `net/safe-fetch.ts` | SSRF-hardened fetch: http(s) only, public IPs only, manual redirect re-validation, timeout, size cap |
| `gemini/` | `AIService` interface, `GeminiService` (Gemini Flash), zod schemas, the four task prompts, response cache |
| `pipeline/` | `run.ts` orchestrator, `filters.ts` (hard filters), `prefilter.ts` (cheap relevance gate), event logger |
| `deduplication/` | Pure matching rules + `resolveStartupAndRound` over a repository interface (Supabase + in-memory impls) |
| `research/` | `ResearchProvider` implementations (articles, company website, Gemini+Google Search) and profile persistence |
| `scoring/` | `compute.ts` (pure scoring math), `config.ts` (loads active thesis), `assess.ts` (Gemini Task 3 + persistence) |
| `outreach/` | Outreach guard, generator (Gemini Task 4), `DraftProvider` (Gmail / database) |
| `thesis/` | zod schema shared by the settings UI and its server action |
| `supabase/admin.ts` | Server-only service-role client |
| API routes | `/api/cron/pipeline` (Bearer `CRON_SECRET`), `/api/pipeline/run` (no login; runs in `after()`, serialized by the run lock) |

## Third-party services

| Service | Use |
|---|---|
| Supabase (Postgres) | Single data store, versioned thesis, audit trail |
| Gemini Flash (Google AI) | **Every** runtime AI call (classification, profile synthesis, scoring, outreach; Google Search grounding for research) |
| Gmail API (optional) | `users.drafts.create` only — drafts, never sends |
| Vercel | Hosting + Cron |
| ET Entrepreneur, Inc42, YourStory, Entrackr | Public funding-news feeds |

## Data stores (Supabase tables)

`sources` · `funding_articles` · `startups` · `founders` · `funding_rounds` · `funding_round_sources` · `investors` · `funding_round_investors` · `accelerator_theses` · `scoring_criteria` · `fit_assessments` · `outreach` · `pipeline_runs` · `pipeline_events` · `ai_calls` (Gemini cache/audit). RLS is enabled everywhere with no policies; only the server's service-role key can access data.

## AI calls (all Gemini Flash, model id from `GEMINI_MODEL`)

| # | Task id | Input | Output |
|---|---|---|---|
| 1 | `classify_article` | headline, snippet, article text, source, published time | funding?, roundup?, company, India?, stage (normalised), amount, currency, investors, confidence |
| 2 | `synthesize_profile` (+ `research_grounded` with Google Search) | fetched documents + citations | structured profile with explicit `null`/`unknowns` |
| 3 | `assess_fit` | profile + active thesis + criteria to score | per-criterion scores, signals, concerns, reasoning, confidence (totals computed in code) |
| 4 | `generate_outreach` | profile, round, fit signals, sender | `{subject, body}` |

Structured calls use `responseMimeType: application/json` + `responseJsonSchema`, are validated with zod, get one repair retry, and are cached by input hash in `ai_calls`.

## Scheduling

The app deliberately runs on the **Vercel Hobby (free) plan**, where Vercel Cron can fire at most once a day. Two schedulers therefore call the *same* secured endpoint, `GET /api/cron/pipeline` (`Authorization: Bearer $CRON_SECRET`):

| Scheduler | Cadence | Role |
|---|---|---|
| Vercel Cron (`vercel.json`) | daily, 03:30 UTC (09:00 IST) | Morning safety/anchor run; works even if GitHub is unavailable |
| GitHub Actions (`.github/workflows/pipeline-cron.yml`) | every 2 hours (minute 15) | The discovery cadence the product needs |

GitHub scheduled workflows have no timing guarantee and can start late (or occasionally skip a slot), so the dashboard's **Pipeline Health** card shows the time since the last successful run and flags *Delayed* / *Warning*. The pipeline can always be run manually from the dashboard button (or `npm run pipeline`).

```mermaid
flowchart LR
  V[Vercel Cron daily] --> E[/api/cron/pipeline/]
  G[GitHub Actions every 2h] --> E
  M[Dashboard: Run now] --> R
  E --> R{acquire_pipeline_lock}
  R -- lock held by another run --> S[skipped: already_running\nno run row, no Gemini calls]
  R -- acquired --> P[pipeline run] --> L[release lock in finally]
```

**Concurrency control.** Runs are serialized by an atomic lease in Postgres (`pipeline_lock` table, `acquire_pipeline_lock` / `release_pipeline_lock` functions, migration `20261012000005`). A single `INSERT … ON CONFLICT DO UPDATE … WHERE expires_at <= now()` claims the lease, so two simultaneous triggers cannot both win. (A session-level `pg_advisory_lock` was rejected because the app talks to Postgres over stateless HTTP, where the lock's connection is not stable.) The lease is sized to the run deadline plus a grace period, is released in a `finally`, and expires on its own if a function instance dies. When a new run takes the lock, any `pipeline_runs` row still `running` is marked `failed` with a `stale_run` error. A caller that loses the race gets `{"status":"skipped","reason":"already_running"}` (HTTP 200) before any source is polled or Gemini is called. Row-level unique indexes (articles, startups, rounds, one live outreach per startup) remain as a second line of defence.

A time budget stops new work before the function limit and leaves the rest `pending` for the next run.

## Configuration

Business rules live in Supabase (`accelerator_theses`, `scoring_criteria`): allowed countries/stages, max age, threshold, sectors, weights, recency bands, stage points, thesis text. Secrets and runtime knobs live in environment variables (`.env.example`).


## UI shell and theming

Public landing page at `/` (`src/app/page.tsx`); the operator pages live in the `(app)` route group, whose layout adds the navigation bar. Light/dark mode is a class on `<html>` set before paint by an inline script (saved choice, else the OS preference) and switched by `components/theme-toggle.tsx`; `globals.css` remaps the Tailwind palette variables under `.dark`.

**Access.** There is no login: anyone with the URL can view the pages, edit the thesis, review drafts and trigger a run. `/api/cron/pipeline` still requires `CRON_SECRET`. The run lock prevents overlapping runs, but see the README for the exposure this implies.

## Contact discovery (`src/lib/contacts`)

Runs after a startup qualifies and before the draft is created (`pipeline/run.ts` → `enrichContactsSafely`, plus a per-run backfill). Free sources only.

```mermaid
flowchart LR
  Q[Qualified startup] --> A[Official site crawl<br/>mailto · text · JSON-LD · cfemail]
  A --> C[GitHub public profile/org email]
  C --> B[Gemini grounded search<br/>fetch cited pages, extract]
  B --> P[Pattern guesses<br/>stored, never used]
  P --> V[Syntax + MX<br/>+ optional Hunter]
  V --> R{Rank}
  R -->|1-2 founder · 3 company · 4 form| PC[Preferred contact]
  R -->|none reliable| NF[not_found]
  PC --> D[Draft recipient prefill<br/>confirmed/verified only]
```

| Module | Role |
|---|---|
| `crawler.ts`, `robots.ts`, `http.ts` | Polite same-domain crawl, robots.txt, retries with jittered backoff, per-host rate limit; all fetches go through `net/safe-fetch.ts` (SSRF guard on every redirect) |
| `extract.ts`, `attribute.ts`, `names.ts` | Email extraction and founder/company attribution |
| `github.ts`, `search.ts`, `patterns.ts` | Discovery providers |
| `verify.ts` | Syntax, MX (null-MX aware), optional Hunter verification |
| `rank.ts` | Preferred-contact hierarchy and non-downgrading merge |
| `pipeline.ts` | Orchestration (`enrichStartupContacts`, `enrichMany`); store/provider interfaces for testing |
| `storage.ts`, `budget.ts` | Supabase persistence (idempotent upserts), monthly free-quota budget |

Tables: `startup_contacts` (one row per address / contact form; one preferred per startup), `enrichment_budget`; columns `startups.contact_status/contact_checked_at/contact_error`.

## Run progress (`pipeline/progress.ts`)

`ProgressTracker` keeps a done/total counter per stage (`sources → prefilter → classify → filters → research → scoring → contacts → drafts`) plus a one-line activity message, and writes it (throttled) to `pipeline_runs.progress_json`. `run.ts` feeds it as items pass through each stage (`add` / `tick` / `track`). The dashboard component `components/pipeline-progress.tsx` polls `GET /api/pipeline/progress`. If the column is missing the writer fails once and progress is switched off without affecting the run.
