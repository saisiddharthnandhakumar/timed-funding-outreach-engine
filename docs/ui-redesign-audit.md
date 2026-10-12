# UI redesign audit (Phase A)

_Written 2026-10-12, before any UI code was changed. Baseline: `npm run lint` PASS, `npm run typecheck` PASS, `npm test` 121 passed / 2 skipped._

Scope: the **frontend only** (routes, components, view-layer queries, server actions). The pipeline, Supabase schema, Gemini tasks, scoring, dedupe, research, contact discovery, scheduling and the `/api/cron/pipeline`, `/api/pipeline/run`, `/api/pipeline/progress` routes are not changed by the redesign.

Level key used throughout: **L1** always visible · **L2** one interaction away · **L3** advanced / technical (only on request).

## 1. Inventory of what exists today

### Routes

| Route | File | Purpose today |
|---|---|---|
| `/` | `app/page.tsx` | Public landing page (marketing hero, live numbers, “how it works”) |
| `/dashboard` | `app/(app)/dashboard/page.tsx` | System dashboard: manual run, live progress, 6 KPI cards, pipeline health, last run, event log |
| `/feed` | `app/(app)/feed/page.tsx` | Every funding event + every filtered/pending article |
| `/qualified` | `app/(app)/qualified/page.tsx` | Table of qualified startups |
| `/startups/[id]` | `app/(app)/startups/[id]/page.tsx` | Everything known about one startup |
| `/drafts` | `app/(app)/drafts/page.tsx` | Up to 100 drafts as editable forms |
| `/settings` | `app/(app)/settings/page.tsx` | Thesis editor + version history |
| `/sources` | `app/(app)/sources/page.tsx` | Source health + performance tables, enable/disable |
| `/api/cron/pipeline` | `app/api/cron/pipeline/route.ts` | Scheduled run, `CRON_SECRET` bearer auth |
| `/api/pipeline/run` | `app/api/pipeline/run/route.ts` | Manual run (202 + `after()`) |
| `/api/pipeline/progress` | `app/api/pipeline/progress/route.ts` | Latest run + `progress_json`, polled by the UI |

### Components (`src/components`)

`ui.tsx` (PageHeader, Card, Stat, Badge, StatusBadge, ScorePill, Table/Td, StartupLink, SetupNotice), `choice-input.tsx` (multi-select dropdown with validated custom entries), `thesis-form.tsx`, `pipeline-progress.tsx`, `run-pipeline-button.tsx`, `send-draft-button.tsx` (uses `window.confirm`), `rerun-contacts-button.tsx`, `copy-button.tsx`, `theme-toggle.tsx`.

### Data access and server actions

* Reads: `lib/queries.ts` — `dashboardData`, `feedData`, `qualifiedData`, `startupDetail`, `draftsData`, `sourcesData`, `thesisData`. All use the service-role client server-side (`db()`); no client-side Supabase.
* Writes (server actions): `drafts/actions.ts` (`updateDraft`, `setDraftStatus`, `sendDraftEmail`), `settings/actions.ts` (`saveThesis` → RPC `save_thesis_version`), `sources/actions.ts` (`toggleSource`), `startups/[id]/actions.ts` (`rerunContactEnrichment`).
* Client state: theme (localStorage + inline init script), progress polling (`/api/pipeline/progress`, 2 s while running / 15 s idle), thesis form state, run-button state.
* Auth: **none in the UI by explicit user decision (2026-10-12)**; only `/api/cron/pipeline` is protected (`CRON_SECRET`). The redesign must not change this, and must not imply a login that does not exist.

### Fields that do NOT exist (important for honesty)

* No **priority score** → the UI uses **fit score** and says so. Nothing is fabricated.
* No stored **“why now”** or **“recommended angle”** text. These are derived deterministically in the view layer from stored facts (round stage/amount/investors/announcement time; assessment `positive_signals`, `concerns`, `reasoning`; research profile). No new model call, no invented claims. See `lib/opportunities.ts`.
* No **“reviewed / viewed”** flag on a startup. “Reviewed” is derived from the outreach status (approved / sent / rejected / cancelled = a human acted).

## 2. Screen-by-screen audit

### 2.1 Dashboard (`/dashboard`)

* **Purpose today:** “is the pipeline working?” — a system monitor.
* **Data shown:** 6 KPIs (articles, events, qualified, rejected, drafts, avg ingestion delay); live per-stage progress (8 stages with bars); pipeline health (last success, time since, cadence, latest failure); last run counters + errors; last 12 pipeline events.
* **Functionality:** manual “Run pipeline now”; progress polling; router refresh after a run starts.
* **Problem:** answers none of the scout’s seven questions.

| Item | Level | New home |
|---|---|---|
| “Who should I act on” (qualified, unreviewed, by fit) | L1 | **Today** (new) |
| Counts: opportunities needing attention, drafts to review | L1 | **Today** header line |
| “System healthy · Last scan N min ago” | L1 (subtle) | Top bar chip on every page → opens **system sheet** |
| Manual run | L2 | Today header (“Scan now”, quiet) + **Settings → System** |
| Live progress, simplified 5-step summary | L1 only while a run is active | Today banner while running; full 8-stage view in Settings → System (L3 expand) |
| Pipeline health detail (last success, next expected, cadence, errors) | L2 | **System sheet** + Settings → System |
| 6 KPI numbers, avg ingestion delay | L3 | Settings → System “Last 24 hours” |
| Last run counters, errors | L3 | Settings → System → Run history |
| Recent pipeline events | L3 | Settings → System → Event log (collapsed) |

### 2.2 Funding Feed (`/feed`)

* **Purpose today:** audit trail of every funding event plus every filtered article.
* **Data shown:** per round: startup, sector, stage, amount, each reporting publication with published → first-seen times, status, raw rejection reason. Second table: latest 60 filtered/pending/error articles with source and outcome.
* **Functionality:** link to startup; external article links.

| Item | Level | New home |
|---|---|---|
| Startup, stage, amount, human status | L1 | **Discoveries** list |
| Rejected / not-a-fit rows | L2 | hidden behind “Show rejected” toggle, visually muted |
| Reporting publications (published → first seen) | L2 | per-row disclosure “Coverage” |
| Raw rejection code | L3 | translated (“Too old”, “Stage outside thesis”…); raw code in `title`/technical disclosure |
| Filtered/pending articles table | L2 | Discoveries → “Articles that didn’t become a funding event” disclosure |

### 2.3 Qualified (`/qualified`)

* **Purpose today:** shortlist; 8-column table (startup, sector, funding, fit, top reasons, research status, contact, draft).
* **Functionality:** link to startup; shows preferred contact + verification; research & draft status.
* **Moves to:** **Opportunities** (merged with the “feed” mental model for normal use). One row per startup, ordered by fit then recency. Filters: All / New / Draft ready / Reviewed + advanced `Filters` popover (stage, sector, funding amount, min score, age, location, source). Research status, thesis version, scored-at → L3 on the detail page. Contact status → draft-readiness line on the row + detail.

### 2.4 Startup detail (`/startups/[id]`)

* **Purpose today:** a dump of every table: profile (10 fields), traction/customers/partnerships, founders, contact card + table, funding rounds + articles, research evidence, full fit assessment per thesis version, generated outreach.
* **Functionality:** open website/LinkedIn/article links; copy email; “Re-run contact search” (server action, 120 s max duration); view all assessments incl. criterion scores, positive signals, concerns, reasoning, model name; view generated outreach.

| Item | Level | New location (`/opportunities/[id]`) |
|---|---|---|
| Name, verdict (“Strong fit”), fit score, stage · amount, announced-ago, primary action | L1 | Decision header |
| Why now | L1 | Section A |
| Why it fits (top positive signals), concerns | L1 | Section B |
| Score breakdown (criterion bars, reasoning, thesis version, model, assessed-at) | L2 | “View score breakdown” disclosure |
| Company snapshot (stage, sector, location, founded, model, funding, website) | L1 | Section C |
| Product & traction (product, customer, traction, customers, partnerships, differentiation, tech, market, unknowns) | L1/L2 | Section D (summary visible; details expandable) |
| Founders (+ LinkedIn) | L1 | Section E |
| Outreach recommendation: angle, talking points, draft readiness, preferred contact + copy | L1 | Section F |
| All discovered contacts, verification, MX flags, evidence, “Re-run contact search” | L2 | “Contact details” disclosure inside Section F |
| Funding rounds, investors, source articles, research evidence links | L2 | “Sources and evidence” (collapsed) |
| Enrichment status, contact status/error, thesis version, model, event-related IDs, earlier assessments | L3 | “System details” (collapsed, secondary) |
| Generated outreach body | L1 → | **Draft** screen (`/drafts/[id]`), linked from header |

### 2.5 Drafts (`/drafts`)

* **Purpose today:** review/edit/approve/send up to 100 drafts as stacked forms.
* **Data shown:** startup, stage·amount, fit, status, provider (“Gmail draft”/“stored in app only”), age; recipient name/email, subject, body textareas; sent line.
* **Functionality (all must survive):** edit recipient name/email/subject/body (only while generated / draft_created / approved), Approve, **Send email** (Resend; guards: approved only, valid recipient, no unverified guessed address, idempotent; confirm prompt), **Mark as sent** (sent from own mail client), **Reject**, send-config problem message, sent confirmation line.

| Item | Level | New home |
|---|---|---|
| Queue: startup, subject, recipient, state, age | L1 | **Drafts** list (filter: To review / Approved / Sent / All) |
| Reading surface: To, Subject, body | L1 | **Draft** page |
| Primary action: Approve → Send (state-dependent) | L1 | Draft page, one primary at a time |
| Edit | L2 | Edit toggle (inline) |
| Copy, Open in Gmail | L2 | secondary buttons |
| Mark as sent, Reject | L2 | “More” menu with confirm dialog |
| “Why this message” checks | L1 | derived from the real draft/contact/research data |
| Provider, send-config problem, from address | L3 | footnote / Settings → Integrations |
| Back to evidence | L2 | link to opportunity |

### 2.6 Settings (`/settings`)

* **Purpose today:** edit thesis in one long form + version history.
* **Data/controls:** geography, stages, max announcement age, min fit score, core sectors, subsectors, excluded areas, business models, natural-language thesis, 8 criterion weights + descriptions + enable (total must be 100), recency bands, stage points, “Save as version N+1”; version history list.
* **Functionality to preserve exactly:** validation through `ThesisInputSchema`, dropdown-only fields with validated custom entries (`ChoiceInput`), weight total = 100 guard, versioned atomic save (RPC), past assessments keep their version.

| Item | Level | New home |
|---|---|---|
| Natural-language thesis | L1 | **Settings → Investment thesis** (leads the page) |
| Geography, stages, sectors | L1 | “Focus” group |
| Min fit, max age | L1 | “Qualification” group |
| Subsectors, excluded, business models | L1/L2 | “Priorities” group |
| Weights, recency bands, stage points | L2 | “Advanced scoring” disclosure |
| Version history | L2 | collapsed under the form |
| “Save changes” | primary | sticky save bar, appears when edited |

### 2.7 Sources (`/sources`)

* **Purpose today:** polling health + performance per source; enable/disable.
* **Data:** name, type, interval, enabled toggle, last polled, last success, items last poll, articles stored, last error; performance: funding reports, avg ingestion delay, wins, unique discoveries.
* **Moves to:** **Settings → Discovery**. L1: name + plain status (Healthy / Delayed / Needs attention / Paused). L2 (click a source): last success, items found, articles stored, last error text, enable/disable. L3 (“Technical details”): type, poll interval, feed URL/key, last polled, performance metrics (delay, wins, unique).

### 2.8 Landing (`/`)

* **Purpose today:** public marketing page with an illustrative example (“Nimbus AI”), live counters, a gradient/glow hero.
* **Decision:** keep as a quiet public front door, restyled with the same tokens (no glow/gradient text), and re-point CTAs to **Today**. It still shows the live numbers. Low priority (Phase H).

### 2.9 Shared shell

* **Today:** a 6-link horizontal header (Dashboard, Funding Feed, Qualified, Drafts, Thesis Settings, Sources) + theme toggle. No active state.
* **New:** collapsible sidebar (Today, Opportunities, Drafts · Discoveries · Settings), top bar with ⌘K search, system-status chip, theme toggle; bottom tab bar on phones.

## 3. Capability checklist (feeds `docs/ui-functionality-matrix.md`)

Pipeline: manual trigger · scheduled run (Vercel cron + GitHub Actions) · source ingestion · live progress · run lock skip behavior (API only) · run history/errors · event log · health (healthy/delayed/warning) · cadence info.
Data: article feed with coverage · funding events · filtered/rejected articles with reasons · qualification · rejection reasons · deduplication (one event ↔ many articles) · research profile · founders · contacts (+ verification, re-run) · fit scores · criterion scores · thesis version per assessment · positive signals · concerns · reasoning · investors.
Thesis: editable thesis · all fields · weights total guard · versioned save · history.
Sources: enable/disable · source health · performance metrics.
Outreach: draft list · edit · approve · send (Resend) · mark sent · reject · Gmail draft link (when provider is gmail) · outreach state per startup · send-config validation.
Platform: theme toggle · landing page · cron auth · no UI auth (documented).
New: global search (⌘K) · human status vocabulary.

## 4. Risks found in the current UI (to fix as part of the redesign)

1. `window.confirm` for the send step (not accessible/styleable) → proper dialog with focus management.
2. `updateDraft` silently ignores validation failures → surface an error message.
3. Status badges use 6 colors; several statuses distinguished by color only → text + dot, one accent.
4. The nav has no active state; Settings is called “Thesis Settings”; “Sources” is top-level.
5. Dark mode is implemented by remapping Tailwind slate/indigo variables globally → replaced by semantic tokens.
6. Startup page renders 8+ cards; the fit score breakdown is always expanded.
