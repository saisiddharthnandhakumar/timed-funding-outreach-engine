# UI functionality matrix (before → after)

_2026-10-12. Every capability of the old UI, where it lives now, how deep it sits, and **how it was verified**. “Preserved” is claimed only where something was actually exercised._

**Visibility:** L1 always visible · L2 one interaction away · L3 advanced/technical.

**Evidence key**
* **Live** = rendered/exercised in a browser against the project’s real Supabase (dev server, `.env.local`).
* **Fixture** = rendered in a browser with throw-away sample data (a temporary route, since deleted) because the live database currently holds **0 startups, 0 funding events, 0 assessments, 0 drafts** (129 articles only). No fake rows were written to Supabase.
* **Test** = automated test (`npm test`, 157 passing / 2 skipped).
* **Unchanged** = the code path was not touched by the redesign (same file, same behaviour); only its caller moved.
* **Not exercised** = could not be run end-to-end; reason given. These are listed again in “Gaps” below.

## Pipeline and system

| Capability | Old location | New location | Level | Verified |
|---|---|---|---|---|
| Manual pipeline trigger | Dashboard button | Today (“Scan now”), system sheet, Settings → System | L2 | **Live**: pressed on Today; `POST /api/pipeline/run` 202, run completed, 0 errors, page refreshed itself |
| Live progress | Dashboard panel (8 stages) | Today banner (5 plain steps, only while running) + Settings → System (full 8-stage view) | L1 while running / L3 detail | **Live**: banner showed “Reviewing funding announcements…”; top bar switched to “Scanning…”; **Test**: `scanSteps` mapping |
| Scheduled pipeline (Vercel cron + GitHub Actions) | `/api/cron/pipeline` | same endpoint | — | **Unchanged**; **Live**: endpoint still answers 401 without the secret |
| Pipeline health (last success, time since, cadence, latest failure) | Dashboard card | Top-bar chip → system sheet; Settings → System | L1 (chip) / L2 (sheet) / L3 | **Live** (chip, sheet, System page all render real data); **Test**: health bands (existing) |
| Next scheduled scan / Vercel + GitHub cadence | (cadence sentence only) | System sheet, Settings → System, Settings → Discovery | L2 | **Test**: schedule math; **Live**: values shown |
| Last-run counters, run errors | Dashboard “Pipeline status” | Settings → System → Recent scans | L3 | **Live** |
| Recent pipeline events | Dashboard list | Settings → System → Event log | L3 | **Live** (renders; list empty/short) |
| 24 h numbers (articles, events, qualified, rejected, drafts, avg delay) | Dashboard KPI cards | Settings → System → “Last 24 hours” (compact) | L3 | **Live** |
| Run lock / skipped overlap | pipeline code | pipeline code | — | **Unchanged** (existing integration tests pass) |

## Discovery

| Capability | Old location | New location | Level | Verified |
|---|---|---|---|---|
| Source ingestion | pipeline | pipeline | — | **Live**: scan ingested 3 new articles (129 → 131) |
| Source health | `/sources` | Settings → Discovery (Healthy / Delayed / Needs attention / Paused) | L2 | **Live** (5 real sources, all Healthy); **Test**: health rules |
| Source detail (last success, items found, articles stored, last error) | `/sources` table | click a source in Settings → Discovery | L2 | **Live** |
| Technical details (type, key, interval, feed URL, delay, wins, unique) | `/sources` tables | Settings → Discovery → source → Technical details | L3 | **Live** |
| Enable / disable a source | `/sources` | Settings → Discovery → source | L2 | **Not exercised** (would change a live source; same server action body, new path/revalidate only) |
| Source health in the “needs attention” strip | — (new) | Today strip, only when a source is stale/failing | L1 when needed | **Test**: `needsAttention` rule |
| Article feed with coverage (published → first seen) | `/feed` | Discoveries (per-row “Reported by N publications”) | L2 | Article list **Live**; per-event coverage not rendered live (no funding events in the database) |
| Funding events list | `/feed` | Discoveries | L1 | **Live**: empty state; row layout not seen with data |
| Rejected / filtered articles + reasons | `/feed` second table | Discoveries → “Articles that didn’t become a funding event” | L2 | **Live**: “Stage outside thesis”, “Not a funding announcement”, “Too old” shown, raw code in tooltip |
| Rejected funding events | `/feed` (always shown) | Discoveries → “Show rejected (N)” toggle, visually muted | L2 | **Test**: `roundLabel`; toggle not seen with data |
| Deduplication (many articles → one event) | `/feed`, startup page | Discoveries coverage; startup page → Sources and evidence (“N articles reported this round; merged into one funding event”) | L2 | **Fixture** (evidence section), **Unchanged** logic |
| Status/rejection terminology | raw codes | human labels (`lib/labels.ts`) | — | **Test** |

## Opportunities and startup detail

| Capability | Old location | New location | Level | Verified |
|---|---|---|---|---|
| Qualified list | `/qualified` | Opportunities (+ All / New / Draft ready / Reviewed, search, `Filters`) | L1 | **Fixture** (rows, popover, segmented control); **Live** (empty state, counts); **Test**: ordering, filters, buckets |
| Fit score | `/qualified`, startup page | Fit indicator everywhere (priority score does not exist, so none is shown) | L1 | **Fixture**, **Test** |
| Top reasons | `/qualified` column | “Recommended angle” on Today; “Why it fits” on the startup page | L1 | **Test** |
| Research status | `/qualified` column | Startup page → System details | L3 | **Fixture** |
| Thesis version of a score | `/qualified` | Startup page → score breakdown / System details | L2/L3 | **Fixture** |
| Draft state per startup | `/qualified` column | Row status label; startup page → Outreach | L1 | **Fixture** |
| Preferred contact + verification | `/qualified`, startup page | Startup page → Outreach (“Who to contact”) | L1 | **Fixture** |
| Company profile (website, HQ, sector, model, founded) | startup page | Company snapshot | L1 | **Fixture** |
| Product, customer, technology, market, differentiation, traction, customers, partnerships, “not established” list | startup page | Product & traction | L1 | **Fixture** |
| Founders + LinkedIn | startup page | Founders | L1 | **Fixture** |
| All contacts, verification, MX flag, evidence, source | startup page table | Outreach → Contact details | L2 | **Fixture** |
| Re-run contact search | startup page | Contact details → “Search again” | L2 | **Not exercised** (crawls a site and calls Gemini; server action body unchanged, only revalidated paths changed) |
| Copy contact email | startup page | Outreach, Contact details | L1/L2 | **Fixture** (icon button renders; clipboard not asserted) |
| Funding rounds, investors, source articles | startup page | Sources and evidence | L2 | **Fixture** |
| Research evidence links | startup page | Sources and evidence | L2 | **Fixture** |
| Fit assessment: criterion scores, signals, concerns, reasoning, model, thesis version, all past assessments | startup page | “View score breakdown” (+ Why it fits) | L2 | **Fixture** |
| Generated outreach text | startup page | Draft page (linked from header) | L1 | **Fixture** |
| Internal IDs, statuses, model names | (mixed in) | Startup page → System details | L3 | **Fixture** |
| Open any startup, incl. rejected / unscored | `/startups/[id]` | `/opportunities/[id]` (redirect from old URL) | — | **Live**: redirect 308; unknown id renders not-found |

## Drafts and outreach

| Capability | Old location | New location | Level | Verified |
|---|---|---|---|---|
| Draft list | `/drafts` stacked forms | Drafts (To review / Approved / Sent / All) | L1 | **Live** (empty state); **Fixture** (draft page) |
| Read a draft | form fields | Draft page reading surface | L1 | **Fixture** |
| Edit recipient name/email, subject, body (only while editable) | always-on inputs | Edit toggle on the draft page; same validation, now with visible error messages | L2 | **Not exercised** (no drafts in DB). Server action validated by reading; error path surfaces in UI (**Fixture**: invalid id → “That action isn’t available.” appeared in the bar) |
| Approve | button | primary on “Needs review” drafts | L1 | **Fixture** (click → server action round trip, error surfaced); success path **Not exercised** |
| Send via Resend (guards: approved only, valid recipient, no guessed address, idempotent) | “Send email” + `window.confirm` | Primary on approved drafts → accessible confirm dialog | L1 | **Test**: all 13 existing send tests pass (guards live in `lib/outreach/send.ts`, unchanged); UI send **Not exercised** (would email a real address) |
| Mark as sent (sent myself) | button | “More” menu → confirm | L2 | **Not exercised** |
| Reject | button | “More” menu → confirm | L2 | **Not exercised** |
| Send-config problem / sender | inline | blocked reason under the bar; Settings → Integrations | L2/L3 | **Live**: Integrations page shows real configuration status |
| Gmail draft provider note | “Gmail draft / stored in app only” | Draft page → Delivery details; Integrations | L3 | **Live** (Integrations) |
| Open in Gmail (prefilled) / Copy email | — (new) | Draft page secondary actions | L2 | **Test**: link builder; **Fixture** |
| “Why this message” checks | — (new) | Draft page | L1 | **Test**; **Fixture** |

## Settings and platform

| Capability | Old location | New location | Level | Verified |
|---|---|---|---|---|
| Editable natural-language thesis | `/settings` (below the fold) | Settings → Investment thesis (leads the page) | L1 | **Live** |
| Geography, stages, sectors, subsectors, excluded areas, business models (dropdown-only + validated custom entries) | `/settings` | Focus / Priorities groups (same `ChoiceInput` logic) | L1/L2 | **Live** (rendering, chips, stage toggle); **Test**: schema |
| Max announcement age, min fit score | `/settings` | Qualification | L1 | **Live** |
| Scoring weights (must total 100), recency bands, stage points | `/settings` | Advanced scoring | L2 | **Live** (disclosure present); **Test**: weight validation |
| Save as a new versioned thesis (atomic RPC) | `/settings` | “Save changes” bar (appears when edited; shows next version number) | L1 | **Live**: dirty state, save bar and discard verified; **the save itself was not run** against the real database (it would create thesis v2 in your production data); action `saveThesis` unchanged; **Test**: thesis schema / change tests |
| Version history | `/settings` list | Settings → Investment thesis → Version history | L2 | **Live** |
| Integrations status (new view) | — | Settings → Integrations | L2/L3 | **Live** (names only, no secrets) |
| Theme toggle (light/dark, no flash) | header | sidebar footer / mobile top bar | — | **Live** (both themes seen) |
| Public landing page | `/` | `/` (restyled, CTA → Today) | — | **Live** (200) |
| Cron authentication | `CRON_SECRET` | unchanged | — | **Live**: 401 without secret |
| UI authentication | none (decision 2026-10-12) | none | — | Unchanged; nothing implies a login |
| Global search (new) | — | ⌘K / Ctrl-K, top bar | L1 | **Live**: palette opens, filters pages, Esc closes; `/api/search` returns results shape (0 matches: empty DB) |
| Old routes | `/dashboard`, `/qualified`, `/startups/[id]`, `/feed`, `/sources` | redirect to new routes | — | **Live**: all return 308 to the right place |

## Gaps (honest list)

1. **No live opportunity data.** The database has no startups/assessments/drafts right now, so Opportunities, the startup page and the draft page were verified with fixtures, not live rows. The queries that feed them (`lib/opportunities/query.ts`, `draftDetail`) ran without errors (empty results) but their join shape against real rows is unverified. First real qualified startup should be checked.
2. **Not exercised (would mutate data or contact someone):** saving a thesis version, toggling a source, approving / sending / marking-sent / rejecting a real draft, re-running contact search.
3. **Derived, not generated:** “Why now” and “Recommended angle” are composed from stored facts (investors, announcement window, assessment signals, research profile). A model-written angle would need a backend change.
4. **No priority score exists**, so none is shown (Fit is used).
5. **Not verified:** Safari/Firefox, real screen-reader pass, tablet width (phone and desktop were checked).
