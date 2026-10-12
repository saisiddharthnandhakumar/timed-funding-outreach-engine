# UI redesign audit

_Audited 2026-10-12 against `main` (c496d10). Every user-facing route, what it shows, what it lets you do, who needs it, and where it goes._

**Visibility levels** — **L1** always visible (needed for the immediate decision) · **L2** one interaction away (supporting context) · **L3** advanced / technical (audit and debugging only).

**The user** is an accelerator scout. Their daily questions: which startups need me, who first, why them, why now, what do I say, is the draft ready, can I trust the system.

## 1. Screens

| Current route | Current purpose | Data shown | Actions | Who actually needs it | New route | Level | Notes |
|---|---|---|---|---|---|---|---|
| `/` (landing) | Public marketing page | Product story, 8-step funnel, live 24 h counters (articles, events, qualified, drafts, pipeline label) | "Open dashboard" links | Evaluators / first-time visitors | `/` (unchanged layout) | L1 for visitors | Links retargeted to `/today`. Marketing copy is not part of the scouting workflow, so it stays but is no longer the app's front door. |
| `/dashboard` | Operations dashboard | Pipeline progress panel (8 stages), 6 KPI tiles (articles found, funding events, qualified, rejected, drafts, avg ingestion delay), pipeline health card, last-run counters, recent pipeline events | Run pipeline now | Mostly an engineer. The scout needs only "anything for me? is it healthy?" | **`/today`** (briefing) + **`/settings/system`** (everything technical) | Today = L1; ops = L3 | The raw average ingestion delay is dropped from the home screen. It is skewed by late-ingested historical articles. On the System page it becomes a *median over the last 24 h*. |
| `/feed` | Every funding event + filtered articles | Rounds table (startup, stage, amount, every reporting publication with published → first-seen timestamps, status, rejection code); last 60 filtered/pending articles | Click through to startup, open source article | Occasionally, to audit a miss | **`/opportunities?view=discoveries`** | L2 (discoveries) / L3 (filtered, source timestamps) | "Relevant" shown by default; rejected rounds and filtered articles behind a "Filtered" chip. Rejection codes humanised. Raw source URLs and timestamps move into the startup's *Sources & evidence*. |
| `/qualified` | Qualified startups table | Startup, sector, stage·amount, score pill, top 3 reasons, research status, contact, draft status, thesis version | Click through to startup | **Yes, this is the scout's real queue** | **`/opportunities`** (Active) | L1 | Becomes a ranked work queue (fit desc, then freshest). Research status, thesis version and contact internals leave the row. Also de-duplicates startups that were qualified under more than one thesis version. |
| `/startups/[id]` | Startup detail | Company profile table, founders, contact discovery card + table + re-run, rounds & source articles, research evidence, fit assessments (breakdown bars, signals, concerns, reasoning, model), generated outreach | Re-run contact search, copy email | Yes, but in decision order | **`/opportunities/[id]`** | A–G L1, H L2, I L3 | Rebuilt as a decision story (header → why now → why it fits → snapshot → product & traction → founders → outreach). Evidence and technical details are collapsed. |
| `/drafts` | All outreach, editable inline | Per draft: startup, stage·amount, score pill, status badge, provider, age, editable recipient/subject/body, Approve / Send email / Mark as sent / Reject | Edit, approve, send (Resend), mark sent, reject | **Yes** | **`/drafts`** (list) + **`/drafts/[id]`** (review) | L1 | The list becomes a simple review queue. All edit/approve/send/reject actions live on the review view. Server actions unchanged. |
| `/settings` | Thesis editor | 17 controls on one page: geography, 10 stage checkboxes, max age, min score, 3 chip pickers (sectors, subsectors, excluded), business models, free-text thesis, 6 criterion weights + descriptions, recency bands, stage points; version history | Save as new version | The scout, but for ~6 of the controls | **`/settings`** (Investment Thesis) | Basics L1; refinements L2; scoring L3 | Six essentials by default; "Advanced scoring" and "More preferences" collapsed; version history behind a disclosure. |
| `/sources` | Source polling health | Per source: enabled toggle, type, interval, last polled, last success, items, articles stored, last error; source performance (reports, avg ingestion delay, wins, unique discoveries) | Enable / disable source | Engineer; scout only needs "are feeds healthy" | **`/settings/discovery`** | L2 (health) / L3 (performance, config) | Plain list with Healthy / Delayed / Issue / Paused. Detail row opens on click. HTTP-level and config detail only under "Technical details". |
| _(none)_ | — | — | — | — | **`/settings/integrations`** | L2 | New, read-only. Shows whether Gemini, Gmail drafts, Resend sending, cron secret, and the schedulers are configured. No secrets are ever sent to the client. |
| _(none)_ | — | — | — | — | **`/settings/system`** | L3 | Receives the full pipeline UI: manual run, 8-stage progress, run history, errors, event log, scheduler details, source diagnostics. |
| `/api/pipeline/run` | Manual run endpoint | — | POST | — | unchanged | — | Used by the Run button on System and in the health sheet. |
| `/api/pipeline/progress` | Run progress poll | — | GET | — | unchanged | — | |
| `/api/cron/pipeline` | Scheduled run (Bearer `CRON_SECRET`) | — | GET | — | unchanged | — | |
| _(none)_ | — | — | — | — | `/api/system/health` | — | New. Small JSON feed for the always-on health indicator. |
| _(none)_ | — | — | — | — | `/api/search` | — | New. Powers ⌘K (startup, founder, sector). |

## 2. Old → new route map (deep links are preserved with redirects)

| Old | New | Kind |
|---|---|---|
| `/dashboard` | `/today` | 308 |
| `/feed` | `/opportunities?view=discoveries` | 308 |
| `/qualified` | `/opportunities` | 308 |
| `/sources` | `/settings/discovery` | 308 |
| `/startups/:id` | `/opportunities/:id` | 308 |

## 3. Navigation

| Before (6 items, mirrors the pipeline) | After (4 items, mirrors the scout's tasks) |
|---|---|
| Dashboard · Funding Feed · Qualified · Drafts · Thesis Settings · Sources | **Today · Opportunities · Drafts · Settings** |

## 4. Information classification per screen

### Opportunity (card / row)
- **L1:** name, one-line description, stage, amount, location, how recent, sector, fit score, why now, why it fits, draft status, next action.
- **L2:** score breakdown, concerns, contact status, founders, research.
- **L3:** raw source URLs, model confidence, published vs first-seen timestamps, pipeline events, dedupe detail, rejection codes, thesis version, research status, contact lookup internals.

### Today
- **L1:** greeting, count needing attention, drafts ready, priority opportunities, one-line system health.
- **L2:** health sheet (last / next run, source health, latest error, cron cadence).
- **L3:** stage funnel, articles found, AI-processed count, rejected count, ingestion delay, event log — all live under Settings → System.

### Drafts
- **L1:** startup, recipient, subject, age, Review.
- **L2:** "Why this message", startup context link, Gmail / copy.
- **L3:** provider, model name, external draft id.

### Settings
- **L1:** thesis text, geography, stages, focus sectors, min score, max age.
- **L2:** subsectors, excluded areas, business models, version history, source list, integration status.
- **L3:** criterion weights, stage points, recency bands, criterion descriptions, pipeline internals, source diagnostics.

## 5. Machine status → scout language

| Machine value | Shown as |
|---|---|
| `below_threshold` | Not a fit |
| `already_contacted` | Previously contacted |
| `announcement_too_old` | Too old |
| `wrong_stage` | Stage outside thesis |
| `wrong_geography` | Outside target market |
| `not_funding_announcement` | Not a funding announcement |
| article `pending` | Waiting for review |
| `processing` / round `enriching` | Reviewing |
| round `discovered` | New |
| round `rejected` / article `rejected` | Filtered |
| round `error` / article `error` | Needs a retry |
| outreach `generated` / `draft_created` | Draft ready |
| outreach `approved` | Approved |
| outreach `sent` | Sent |

Machine codes are never changed in the database or in code paths; only the display layer maps them.

## 6. Findings that shaped the plan

1. **There is no login.** `proxy.ts`, `/login` and `ADMIN_PASSWORD` were removed on 2026-10-12 (see PROJECT_STATUS). The brief lists "authentication" under capabilities to preserve. The only live auth is the `CRON_SECRET` bearer on `/api/cron/pipeline`, which is untouched. Adding a login would be a product decision, not a UI redesign, so it is not done here. It is called out as a risk in the plan.
2. **No stored "why now", "recommended angle" or "talking points".** Those fields do not exist in the schema. Nothing new is asked of the model. They are derived deterministically from stored facts (round, amount, investors, announcement time, positive signals, traction), in one tested module, and never assert anything that is not in the data.
3. **No "reviewed" state.** The Reviewed filter is defined as "a human has acted on the draft" (approved, sent, rejected).
4. **Duplicate qualified rows.** `fit_assessments` is unique per (round, thesis), so a thesis edit followed by a re-score can put one startup in the qualified list twice. The new query keeps the latest per startup.
5. **Raw average ingestion delay is misleading** when old articles are first seen late. It leaves the home screen; on System it is a 24 h median.
6. **Contact enrichment migration may not be applied** in every environment. Existing queries already tolerate that; the new ones keep that behaviour.
