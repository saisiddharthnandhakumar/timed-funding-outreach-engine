# Project Status

_Last updated: 2026-10-12_

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
- [x] Dashboard **Pipeline Health** card (last success, time since, ~2 h cadence, Healthy/Delayed/Warning, latest failure)
- [x] README + components map document Hobby-plan scheduling (Vercel daily anchor, GitHub Actions 2-hourly, GitHub delays, manual run)
- [ ] **Apply the migration to Supabase** (declined during the session; must be applied before this code is deployed)
- [ ] Re-run integration tests + `tests/integration/pipeline-lock.test.ts` against the migrated DB
- [ ] Commit, push, redeploy

## UI changes (2026-10-12)

- [x] Dark/light mode toggle (saved in localStorage, defaults to OS preference, no flash)
- [x] Public landing page at `/`; dashboard moved to `/dashboard`; app pages in the `(app)` route group
- [x] Password login removed (`proxy.ts`, `/login`, `ADMIN_PASSWORD` gone from code, env example and push script). **The app is now open to anyone with the URL** (cron endpoint still needs `CRON_SECRET`)
- [ ] Redeploy needed; `ADMIN_PASSWORD` can be deleted from Vercel env vars

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
