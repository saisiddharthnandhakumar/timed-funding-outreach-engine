# Project Status

_Last updated: 2026-10-12 (UI redesign)_

## Current Phase

Phase 16 — Final Acceptance (blocked on one pending DB migration, see Current Blockers)

## Completed

- [x] Phase 0 — Environment & audit
- [x] Phase 1 — Application foundation
- [x] Phase 2 — Supabase database (migrations 1–4 applied)
- [x] Phase 3 — Source ingestion (ET Entrepreneur, Inc42, YourStory, Entrackr)
- [x] Phase 4 — Gemini funding classification
- [x] Phase 5 — Eligibility + deduplication
- [x] Phase 6 — Research & enrichment
- [x] Phase 7 — Thesis + fit scoring (versioned thesis, totals computed in code)
- [x] Phase 8 — Outreach generation (DraftProvider; Gmail optional, Supabase drafts otherwise)
- [x] Phase 9 — Product UI
- [x] Phase 10 — Automation & scheduling
- [x] Phase 11 — End-to-end validation (`docs/live-test-report.md`)
- [x] Phase 12 — Documentation (README, components map, `.env.example`, this file)
- [x] Phase 13 — Production quality checks
- [x] Phase 14 — GitHub (`saisiddharthnandhakumar/timed-funding-outreach-engine`)
- [x] Phase 15 — Vercel deployment (https://timed-funding-outreach-engine.vercel.app)

## In Progress — scheduling hardening (post-V1, Vercel Hobby only)

Implemented in code, **not yet committed, migrated or deployed**:

- [x] Atomic DB-level run lock (`pipeline_lock` lease + `acquire_pipeline_lock` / `release_pipeline_lock`), migration `supabase/migrations/20261012000005_pipeline_run_lock.sql`
- [x] Lock-loser returns `{status:"skipped", reason:"already_running"}` with no run row, source polling or Gemini calls
- [x] Lock released in `finally`; lease expires by itself if an instance dies (TTL = run deadline + 75 s)
- [x] Stale-run handling: when a run takes the lock, leftover `running` rows are marked `failed` with a `stale_run` error
- [x] **Pipeline health** (last success, time since, ~2 h cadence, Healthy/Delayed/Warning, latest failure): now a one-line indicator with a details sheet (see UI redesign below)
- [x] README + components map document Hobby-plan scheduling (Vercel daily anchor, GitHub Actions 2-hourly, GitHub delays, manual run)
- [ ] **Apply the migration to Supabase** (declined during the session; must be applied before this code is deployed)
- [ ] Re-run integration tests + `tests/integration/pipeline-lock.test.ts` against the migrated DB
- [ ] Commit, push, redeploy

## UI changes (2026-10-12)

- [x] Dark/light mode toggle (saved in localStorage, defaults to OS preference, no flash)
- [x] Public landing page at `/`; app pages in the `(app)` route group (the old `/dashboard` is now `/today`)
- [x] Password login removed (`proxy.ts`, `/login`, `ADMIN_PASSWORD` gone from code, env example and push script). **The app is now open to anyone with the URL** (cron endpoint still needs `CRON_SECRET`)
- [ ] Redeploy needed; `ADMIN_PASSWORD` can be deleted from Vercel env vars

## Today funnel, live scan, Hunter, Telegram (2026-10-12) — implemented, NOT yet committed or deployed

- [x] **Today**: 24-hour pipeline funnel chart (`src/components/ui/funnel-chart-big.tsx`, reaviz + framer-motion + react-countup) with comparison to the previous 24 h and a "where the rest dropped out" list; data from `funnelData()` in `src/lib/queries.ts`
- [x] **Today**: Scan now button; while a scan runs the live pipeline view (`src/components/ui/ai-agent-pipeline.tsx`, driven by the run's real per-stage progress) replaces the idle state, and the page refreshes when the scan ends (`src/components/scan-panel.tsx`)
- [x] Sidebar search field removed (⌘K and the mobile search icon remain)
- [x] Settings "Discovery" renamed **Sources**; route is now `/settings/sources` (`/settings/discovery` redirects)
- [x] **Hunter** Email Finder in contact discovery (`src/lib/contacts/hunter.ts`); migration `20261012000008_hunter_contact_source.sql` (applied to the live DB)
- [x] **Telegram** alerts (`src/lib/telegram/*`): new startup + draft ready, and a reminder 2 h before the 24 h window closes; `/api/cron/reminders` + `.github/workflows/telegram-reminders.yml`; migration `20261012000009_telegram_once_per_draft.sql` (applied to the live DB)
- [x] Thesis v4 saved to the live DB: stages + Pre-Series A and Undisclosed (with stage points 10 / 5), sector + Semiconductors & Hardware, minimum fit score 60 → 30. Re-ran: Tessolve Semiconductor (75) and Knocksense (33) now have drafts. Revert via Settings → Investment Thesis when real candidates flow
- [ ] Add `HUNTER_API_KEY`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`, `APP_URL` to `.env.local` and Vercel; send `npm run telegram -- --test`

## UI redesign: scout workflow (2026-10-12) — implemented, NOT yet committed or deployed

Information architecture first, then screen hierarchy, then visual polish. No backend, pipeline, scoring, schema or Gmail/Resend code changed.

- [x] Navigation reduced to **Today · Opportunities · Drafts · Settings** (sidebar on desktop, bottom tab bar below 1024 px)
- [x] `/today` morning briefing; `/opportunities` (Active + Discoveries, status chips, Filters); `/opportunities/[id]` decision story; `/drafts` + `/drafts/[id]`; `/settings` (Investment Thesis, Sources, Integrations, System)
- [x] Old routes redirect (308): `/dashboard`, `/feed`, `/qualified`, `/sources`, `/startups/:id`
- [x] Always-on one-line system health with a details sheet; ⌘K search; humanised statuses; empty, loading, error and not-found states
- [x] Send now confirms in a native dialog (To, From, Subject; Cancel focused); Reject and Mark-as-sent also confirm
- [x] Docs: `docs/ui-redesign-audit.md`, `docs/ui-redesign-plan.md`, `docs/ui-functionality-matrix.md` (with honest verification status), README, `docs/components-map.md`
- [x] `npm run check` passes (lint, typecheck, 144 tests, production build)
- [ ] **Not exercised against production** (they write to the live database or send): manual pipeline run, thesis Save, source pause/resume, contact re-run, draft approve / edit / send / reject / mark sent. See the matrix.
- [ ] The live database has no funding rounds, qualified startups or drafts right now, so Today, Opportunities and Drafts were checked live only in their empty states; populated states were checked with throwaway fixture data (not committed).
- [ ] **No login exists** (removed earlier). Anyone with the URL can reach Send. Restore auth before real sending.
- [ ] Not committed: review the diff, then commit and redeploy.

## Contact discovery (2026-10-12) — implemented, NOT yet migrated/deployed

- [x] `src/lib/contacts/*` (crawler, extraction, attribution, GitHub, grounded search, patterns, verification, ranking, storage, budget), integrated after qualification and as a per-run backfill
- [x] Migration `20261012000006_contact_enrichment.sql` written (**not applied**)
- [x] UI: contact card on startup page (copy, re-run), contact details inside the startup page's Outreach section; CLI `npm run contacts`
- [x] 33 mocked tests (all 10 specified scenarios) + one live crawl smoke test against a real public site
- [ ] Apply migration to Supabase, then deploy. Until applied, contact steps log errors (runs show `partial`) and the new UI sections stay empty
- [ ] Live end-to-end contact run on a real qualified startup (needs the migration and the Gemini key)

## Live progress panel (2026-10-12) — implemented, NOT yet migrated/committed

- [x] `ProgressTracker` + instrumentation of every pipeline stage, `/api/pipeline/progress`, per-stage bars on Settings → System
- [x] Migration `20261012000007_pipeline_progress.sql` written (**not applied**); 8 unit tests
- [ ] Apply migration, run the pipeline once and watch the panel on a real run

## Sending via Resend (2026-10-12) — implemented, NOT yet committed/pushed

- [x] Domain `wakeandwyze.com` added and verified in Resend (DKIM, SPF, return-path all verified)
- [x] Send button on approved drafts with guards (approved only, valid recipient, no guessed addresses, idempotent), 13 tests
- [x] `RESEND_API_KEY`, `RESEND_FROM_EMAIL=rohit@wakeandwyze.com`, `RESEND_REPLY_TO=hello@wakeandwyze.com` set in `.env.local` and Vercel Production
- [ ] Commit/push; then send one real test (to an address you own) to confirm end to end. No email has been sent yet.

## Remaining

- [ ] Phase 16 — Final acceptance sign-off (checklist in PRD §39), including a secret scan and a live check of the deployed URL
- [ ] Confirm GitHub repo secrets `APP_URL` and `CRON_SECRET` are set and the 2-hour schedule actually fires
- [ ] Commit `PRD.md` (currently untracked); do not commit `.mcp.json`

## Current Blockers

- Migration `20261012000005_pipeline_run_lock` has **not** been applied to Supabase. Until it is, `runPipeline` fails at "acquire pipeline lock" (cron, manual and CLI runs, and the 3 fixture integration tests). **Do not deploy this code before applying it.** The currently deployed version does not need it.
- `SUPABASE_DB_URL` is empty in `.env.local`, so `npm run db:migrate` and the Postgres-direct tests (`thesis-db`, `pipeline-lock`) cannot run locally; apply via the Supabase MCP/dashboard or set the URL.

## Last Verified State (2026-10-12)

- `npm run lint`: PASS
- `npm run typecheck`: PASS
- `npm run build`: PASS
- `npm test`: unit tests PASS (incl. new `pipeline-health.test.ts`); 3 fixture-integration tests FAIL only because the lock functions don't exist in the database yet; 2 Postgres-direct suites skipped (no `SUPABASE_DB_URL`)
- Lock behaviour in Postgres: **not yet verified** (migration unapplied)
- Production (last verified 2026-10-11): login, pages, cron auth and manual run OK on the previously deployed version

## Important Decisions

- No authentication on the UI by explicit user request (2026-10-12); risk documented in README Limitations

- India-only V1; pre-seed/seed; 24 h eligibility; strict no-repeat outreach
- Runtime AI is Gemini Flash only; Claude is a development tool only
- Vercel **Hobby** plan is intentional: Vercel Cron = daily 09:00 IST anchor; GitHub Actions = 2-hourly cadence; both call the same `CRON_SECRET`-protected `/api/cron/pipeline`; manual run stays available
- Run lock is a Postgres lease row, not `pg_advisory_lock`: the app uses stateless HTTP (PostgREST), so a session-level advisory lock can't be held or released reliably
- Health thresholds: Healthy ≤ 150 min since last success, Delayed ≤ 300 min, Warning beyond that, if the latest run failed, or if no run has ever succeeded

## Next Action

Apply `supabase/migrations/20261012000005_pipeline_run_lock.sql` to the Supabase project (user approval needed), re-run `npm test` (expect the 3 fixture tests to pass again) and the lock integration test, then commit, push and redeploy; after that, work through the Phase 16 acceptance checklist.
