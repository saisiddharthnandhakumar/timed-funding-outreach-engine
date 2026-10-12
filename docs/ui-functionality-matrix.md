# UI functionality matrix

Nothing counts as preserved until it has been exercised. **Preserved?** is the design intent; **Verified?** says how it was actually checked.

Legend: **✅ live** exercised in the browser against the live database · **✅ fixture** exercised in the browser with fixture data (the live database currently has no funding rounds, qualified startups or drafts) · **✅ tests** unit tests · **◐** partly checked · **⏸** deliberately *not* run because it writes to the production database (or sends or runs the pipeline); the code path is unchanged and the gap is stated.

Levels: **1** always visible · **2** one interaction away · **3** advanced / technical.

| # | Capability | Current location | New location | Level | Preserved? | Verified? |
|---|---|---|---|---|---|---|
| 1 | Manual pipeline run | `/dashboard` button | Settings → System (button + progress); also the health sheet | 3 / 2 | Yes | ⏸ Button present on System and in the health sheet; **click not run**: the classifier blocked a production-DB run. Endpoint `/api/pipeline/run` unchanged. |
| 2 | Scheduled pipeline (Vercel cron, GitHub Actions) | `/api/cron/pipeline`, `vercel.json`, workflow | unchanged; schedule shown in health sheet + System | 3 | Yes | ✅ live: schedule and last scheduled run shown. Cron route untouched and not triggered. |
| 3 | Live pipeline progress (8 stages) | `/dashboard` | Settings → System ("Pipeline details"); friendly 5-phase view in health sheet | 3 / 2 | Yes | ✅ live: technical stages render from the latest real run. Friendly 5-phase status not seen mid-run (no run in flight). |
| 4 | Source ingestion (RSS adapters) | backend | unchanged | – | Yes | ✅ No ingestion code changed; full suite passes. |
| 5 | Source health per source | `/sources` | Settings → Sources (Healthy / Delayed / Issue / Paused) | 2 | Yes | ✅ live: 5 of 5 sources, Healthy. |
| 6 | Enable / disable a source | `/sources` toggle | Settings → Sources, source detail | 2 | Yes | ⏸ Pause/resume renders; **not clicked** (writes to production). Action unchanged apart from revalidate paths. |
| 7 | Source performance (reports, delay, wins, unique) | `/sources` | Settings → Sources → source detail → Technical details | 3 | Yes | ✅ live: Technical details expanded on a real source. |
| 8 | Ingestion delay metric | `/dashboard` tile, `/sources` | Settings → System, as a 24 h median | 3 | Yes | ✅ live: System page shows the 24 h value. Window changed to articles *published* in the period after the first reading was 84.6 h from backfill. |
| 9 | Funding event list (every round) | `/feed` | Opportunities → Discoveries (Relevant) | 2 | Yes | ✅ live: Discoveries loads; Relevant is empty because the DB has no funding rounds. Rounds list path not rendered with data. |
| 10 | Rejected rounds + reasons | `/feed` | Opportunities → Discoveries → Filtered | 3 | Yes | ◐ Filtered chip and reasons render for articles (live). No rejected *rounds* exist yet to display. |
| 11 | Filtered / pending articles | `/feed` | Opportunities → Discoveries → Filtered | 3 | Yes | ✅ live: 60 filtered articles with humanised reasons. |
| 12 | Per-publication source URLs and timestamps | `/feed`, `/startups/[id]` | Startup → Sources & evidence | 3 | Yes | ✅ fixture: rendered inside the collapsed section (no runtime errors); not expanded by hand. |
| 13 | Qualified startup list | `/qualified` | Opportunities → Active | 1 | Yes | ✅ fixture rows and cards; ordering and filters ✅ tests. Live DB has no qualified startups. |
| 14 | Fit score | `/qualified`, startup | card / row / detail header | 1 | Yes | ✅ fixture + ✅ tests |
| 15 | Criterion scores (breakdown bars) | startup | Startup → "View score breakdown" | 2 | Yes | ✅ fixture: expanded, bars and totals shown. |
| 16 | Positive signals, concerns, reasoning | startup | signals → Why it fits (1); concerns + reasoning → breakdown (2) | 1 / 2 | Yes | ✅ fixture |
| 17 | Research profile (product, customer, technology, market, differentiation) | startup | Startup → Product & traction | 1 | Yes | ✅ fixture |
| 18 | Traction, customers, partnerships, unknowns | startup | Startup → Product & traction | 1 | Yes | ✅ fixture |
| 19 | Founder data | startup | Startup → Founders | 1 | Yes | ✅ fixture |
| 20 | Contact discovery results (preferred + all) | startup | Startup → Outreach → "Contact details" | 2 | Yes | ✅ fixture: summary line shown; table rendered collapsed. |
| 21 | Re-run contact search | startup | Startup → Outreach → "Contact details" | 2 | Yes | ⏸ **Not clicked** (crawls a site, calls the model, writes). Component and action only moved. |
| 22 | Copy contact email | startup | Contact details; Draft review | 2 | Yes | ⏸ Rendered; not clicked. |
| 23 | Research source list | startup | Startup → Sources & evidence | 3 | Yes | ✅ fixture: rendered collapsed. |
| 24 | Funding round investors (lead flag) | startup | Why now (lead investor), Sources & evidence (all) | 1 / 3 | Yes | ✅ fixture: lead and co-investors in Why now. |
| 25 | Dedupe data (merged reports, normalised name) | `/feed`, startup | Startup → Technical details | 3 | Yes | ✅ fixture: rendered collapsed. |
| 26 | Thesis version on each assessment | `/qualified`, startup | Startup → Technical details; breakdown | 3 | Yes | ✅ fixture |
| 27 | Pipeline events per startup | (dashboard only, global) | Startup → Technical details; global log in System | 3 | Yes | ✅ fixture: rendered collapsed. |
| 28 | Draft list | `/drafts` | `/drafts` | 1 | Yes | ✅ live: empty state ("No drafts need review."); populated list not seen (no drafts). |
| 29 | Edit draft (recipient, subject, body) | `/drafts` inline | `/drafts/[id]` → Edit | 1 | Yes | ◐ Edit form is client code; read view seen with fixture. Save not run. `updateDraft` unchanged. |
| 30 | Approve draft | `/drafts` | `/drafts/[id]` | 1 | Yes | ⏸ Not run (needs a real draft; writes). |
| 31 | Send draft (Resend, human click, confirm dialog, guards) | `/drafts` | `/drafts/[id]` | 1 | Yes | ⏸ **Never sent.** Confirmation dialog verified via the same component on Reject (Cancel focused). Send guards and Resend code untouched, 13 tests pass. |
| 32 | Mark as sent (sent elsewhere) | `/drafts` | `/drafts/[id]` → More | 2 | Yes | ✅ fixture: menu item and confirmation dialog open and cancel. Transition itself not run. |
| 33 | Reject draft | `/drafts` | `/drafts/[id]` → More | 2 | Yes | ✅ fixture: same. |
| 34 | Gmail draft integration (creation on generate) | backend | unchanged (`src/lib/outreach/providers/*` untouched) | – | Yes | ✅ No change under `src/lib/outreach/providers/*`; tests pass. Live Gmail not exercised. |
| 35 | Open in Gmail / copy draft | – | `/drafts/[id]` | 1 | Yes | ◐ Link and Copy render; not clicked. |
| 36 | Outreach state per startup | `/qualified`, startup | card draft status; startup → Outreach | 1 | Yes | ✅ fixture + ✅ tests |
| 37 | Thesis: natural-language text | `/settings` | Settings → Investment Thesis | 1 | Yes | ✅ live: loaded from the active thesis. |
| 38 | Thesis: geography | `/settings` | Settings → Investment Thesis | 1 | Yes | ✅ live |
| 39 | Thesis: allowed stages (all 10) | `/settings` | Investment Thesis (selected shown, "+ Add stage" for the rest) | 1 | Yes | ✅ live: Pre-seed and Seed shown; + Add stage present. |
| 40 | Thesis: focus sectors (custom allowed) | `/settings` | Investment Thesis | 1 | Yes | ✅ live |
| 41 | Thesis: min fit score, max announcement age | `/settings` | Investment Thesis | 1 | Yes | ✅ live: min score 60, max age 24 h. |
| 42 | Thesis: preferred subsectors (custom allowed) | `/settings` | Investment Thesis (summary, click to edit) | 2 | Yes | ✅ live: "Vertical AI · Enterprise AI · Agentic Workflows +8 more". |
| 43 | Thesis: excluded areas, business models | `/settings` | Investment Thesis → More preferences | 2 | Yes | ◐ Collapsed section present; not expanded. |
| 44 | Thesis: criterion weights, enable, descriptions | `/settings` | Investment Thesis → Advanced scoring | 3 | Yes | ✅ live: expanded, 8 criteria, total 100 / 100. |
| 45 | Thesis: stage points, recency bands | `/settings` | Investment Thesis → Advanced scoring | 3 | Yes | ◐ Below the weights; not scrolled to. |
| 46 | Save thesis as new immutable version | `/settings` | Investment Thesis → Save changes | 1 | Yes | ⏸ **Save not clicked**: it would create a new live thesis version. Client validation verified (weight 25→30 shows total 105, disables Save, "Review weights" link). `saveThesis` action unchanged. |
| 47 | Thesis version history | `/settings` | Investment Thesis → "View version history" | 2 | Yes | ✅ live: "View version history · 2 versions" present; list not expanded. |
| 48 | Pipeline health (healthy / delayed / warning) | `/dashboard` card | always-on indicator in the shell + Today; sheet on click | 1 (subtle) / 2 | Yes | ✅ live: Today line, sidebar, sheet. Delayed / Issue states ✅ tests (sentences) but not seen live. |
| 49 | Latest pipeline error | `/dashboard` | health sheet; System | 2 / 3 | Yes | ✅ live: "None" shown. Failure rendering not seen live. |
| 50 | Last run counters (sources polled, articles, processed, events, qualified, drafts) | `/dashboard` | Settings → System | 3 | Yes | ✅ live: runs table on System. |
| 51 | Recent pipeline events | `/dashboard` | Settings → System | 3 | Yes | ✅ live: event history on System. |
| 52 | Integration configuration status | – (env only) | Settings → Integrations | 2 | Yes | ✅ live: all five items. |
| 53 | Theme (light / dark) | header toggle | shell footer toggle | 2 | Yes | ✅ Dark rendering checked by class; toggle button logic unchanged. |
| 54 | Global search (⌘K) | – | shell | 1 | Yes | ✅ live: ⌘K opens, searches, Esc closes and returns focus. No startups in DB to open a result. |
| 55 | Old deep links | `/dashboard /feed /qualified /sources /startups/:id` | redirected to new routes | – | Yes | ✅ curl: all five redirect (308); malformed ids show Not found. |
| 56 | Authentication | none (login removed 2026-10-12); `CRON_SECRET` on cron endpoint | unchanged | – | n/a | There is **no login** (removed 2026-10-12). Cron endpoint's `CRON_SECRET` untouched. Not a regression. |
| 57 | Admin functionality (source toggle, manual run, thesis edit, re-run contacts) | scattered | Settings (Sources, System, Thesis) and startup page | 2 / 3 | Yes | ◐ See rows 1, 6, 21, 46: present, not exercised against production. |
| 58 | Filters | none | Opportunities: status chips + "Filters" (stage, sector, score, location, funding size, age, source) | 1 / 2 | Yes | ✅ tests for parsing and filtering; popover opens, anchored in view ✅ live; submit with real data not run. |
