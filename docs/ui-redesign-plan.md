# UI redesign plan

**Goal.** The app should feel like a scouting workspace where the scout instantly knows who to contact, why they matter, and what to do next. Everything else stays available, one or two interactions deeper.

**Order of work.** Information architecture and navigation first, then screen hierarchy, then visual polish. No backend, pipeline, scoring, database or Gmail/Resend code is changed. The only non-UI code touched is the read-side query layer and the server actions' `revalidatePath` calls.

## 1. Sitemap

```
/                      Landing (unchanged layout, links → /today)
/today                 Morning briefing
/opportunities         Work queue
   ?view=active        (default) qualified, actionable startups
   ?view=discoveries   broader funding events
/opportunities/[id]    Startup detail (decision story)
/drafts                Review queue
/drafts/[id]           Draft review
/settings              Investment Thesis
/settings/sources      Sources
/settings/integrations Read-only integration status
/settings/system       Pipeline, runs, events, diagnostics

/api/system/health     (new) feed for the health indicator
/api/search            (new) ⌘K
/api/pipeline/*        unchanged
/api/cron/pipeline     unchanged
```

## 2. Navigation

Four destinations only: **Today · Opportunities · Drafts · Settings**.

- Desktop (≥1024 px): fixed left sidebar. Wordmark, the four links, a quiet ⌘K search field, the system-health line, theme toggle.
- Tablet / mobile (<1024 px): slim top bar (wordmark, search, theme) and a bottom tab bar with the same four links. Settings stays usable but is desktop-optimised.
- The active item uses `aria-current="page"` and matches nested routes (`/opportunities/[id]` keeps *Opportunities* active).
- A skip link jumps to `<main>`.

## 3. Screen hierarchy

| Screen | Top to bottom |
|---|---|
| **Today** | Greeting and one-sentence summary → compact summary strip (opportunities, drafts ready, last scan) → health line (clickable) → "Priority opportunities" (≤5 cards) → "View all" |
| **Opportunities** | Title + view switch (Active / Discoveries) → status chips (All · New · Draft ready · Reviewed) + "Filters" popover → ranked rows. Discoveries: Relevant · Filtered · All |
| **Startup detail** | A Decision header → B Why now → C Why it fits (+ collapsed score breakdown) → D Company snapshot → E Product & traction → F Founders → G Outreach recommendation (+ collapsed contact details) → H Sources & evidence (collapsed) → I Technical details (collapsed, secondary) |
| **Drafts** | "n ready for review" → list (startup, founder, subject, age, Review) with To review / Approved / Done filter |
| **Draft review** | Header (startup, to, subject) → email body → "Why this message" → one primary action, Gmail / Copy, More (mark sent, reject) → "View startup context" |
| **Settings** | Section nav (Investment Thesis · Sources · Integrations · System) → page |

### Progressive disclosure strategy

Each fact is classified L1 / L2 / L3 in the audit. L1 renders. L2 sits behind a `DisclosureSection` (native `<details>`, so it works without JavaScript and is keyboard-accessible) or a popover. L3 lives in collapsed, visually muted "Technical details" blocks, or on Settings → System. Nothing is deleted.

## 4. Component system

| Component | Kind | Role |
|---|---|---|
| `AppShell`, `Sidebar`, `NavLinks`, `MobileTabBar` | server + client | frame and navigation |
| `PageHeader` | server | title, subtitle, single primary action slot |
| `OpportunityCard` (Today) / `OpportunityRow` (lists) | server | the five-second summary |
| `FundingMeta`, `FitIndicator`, `DraftStatus` | server | shared opportunity building blocks |
| `WhyNow`, `WhyFit` | server | the two reasons, from `src/lib/opportunity/why.ts` |
| `SystemHealth` | client | always-on one-line health + `<dialog>` sheet |
| `ScanStatus` | client | friendly 5-phase scan progress (shares `usePipelineRun` with `PipelineProgress`) |
| `DisclosureSection` | server | progressive disclosure primitive |
| `CompanySnapshot`, `FounderCard`, `EvidenceList` | server | detail sections |
| `DraftViewer` | server | rendered email with To / Subject |
| `DraftActions`, `ActionMenu` | client | one primary action + overflow menu |
| `FilterPopover` | client | advanced opportunity filters (`next/form`, GET) |
| `EmptyState`, `LoadingState`/`Skeleton` | server | intentional empty and loading states |
| `SearchCommand` | client | ⌘K dialog with arrow-key navigation |
| `ThesisForm` (rebuilt), `StageControl`, `CollapsedChoice` | client | settings |

Cards are reserved for units that stand alone (an opportunity on Today, the email). Everything else uses type, whitespace and hairline dividers.

## 5. Data requirements (read side only)

New / changed in `src/lib/queries.ts` and `src/lib/opportunity/*`:

- `opportunitiesData()`: qualified assessments joined with startup, round (+ investors, + reporting sources), latest live outreach, preferred contact. De-duplicated per startup. Returns plain view-models via `toOpportunity()`.
- `todayData()`: opportunities needing attention, drafts ready count, health, last scan.
- `discoveriesData()`: rounds + filtered articles, humanised.
- `startupDetail(id)` extended with pipeline events for the startup (for the Technical block).
- `healthSnapshot()`: pipeline health + per-source health + schedule, shared by Today, the API route and System.
- `sourcesData()`: median over the last 14 days instead of an all-time mean.

Derived, never invented: *Why now*, *Why it fits* (stored `positive_signals`), *Recommended angle*, *Talking points*, *Draft readiness*, *Why this message*. All are plain functions of stored fields and unit-tested (`tests/opportunity-*.test.ts`).

Ordering: **fit score desc, then freshest announcement first**. There is no separate priority score, so none is shown.

"Needs attention" = qualified, announced in the last 7 days, and no human decision on the draft yet (`generated`, `draft_created`, or no draft). One constant.

## 6. Old → new route mapping

`next.config.ts` `redirects()` (308): `/dashboard → /today`, `/feed → /opportunities?view=discoveries`, `/qualified → /opportunities`, `/sources → /settings/sources`, `/settings/discovery → /settings/sources`, `/startups/:id → /opportunities/:id`. No old page remains reachable, so there is no duplicate navigation.

## 7. Accessibility

- Semantic landmarks (`nav`, `main`, headings in order), skip link, `aria-current`.
- Visible `:focus-visible` ring on every interactive element.
- Native `<dialog>` for the health sheet and ⌘K (focus trap, Esc, focus return).
- Status is never colour-only: every state has a word and, where useful, an icon shape.
- Contrast: tokens chosen for ≥4.5:1 body text and ≥3:1 for UI borders in light and dark.
- Forms: every control has a label; errors are text, not colour; the weights-total error links to the collapsed section and opens it.
- `prefers-reduced-motion` respected; no motion carries meaning.
- Touch targets ≥40 px in the mobile tab bar and list rows.

## 8. Visual direction (applied last)

White / warm-neutral surfaces, charcoal text, three gray steps, **one** restrained accent (deep indigo-blue), semantic status in muted tones used sparingly. Geist (already installed; same role as Inter) with tabular numerals. One radius scale, subtle borders, almost no shadow. Dark mode keeps working through the same tokens.

## 9. Migration plan (phases)

| Phase | Work | Exit check |
|---|---|---|
| A | Audit, matrix, plan | docs committed |
| B | Tokens, `AppShell`, 4-item nav, redirects, stub pages | all four routes render, old routes redirect |
| C | `/today`, `SystemHealth`, `/api/system/health` | briefing reads correctly with live data |
| D | `/opportunities` (Active + Discoveries, chips, filters) | ordering, filters, filtered-by-default hidden |
| E | `/opportunities/[id]` | sections A–I, disclosures work |
| F | `/drafts`, `/drafts/[id]` | edit, approve, send guards, mark sent, reject |
| G | `/settings/*` | thesis saves a new version; sources toggle; system run |
| H | empty, loading, error, not-found states, ⌘K | each state seen in the browser |
| I | responsive + accessibility pass (design review by the UX agent) | 375 / 768 / 1280 px, keyboard-only walk |
| J | regression: lint, typecheck, tests, build, browser checks of every matrix row | matrix "Verified?" filled in honestly |

## 10. Risks and open decisions

- **No authentication exists** (removed earlier, documented in PROJECT_STATUS). The redesign does not change that; anyone with the URL can use the app and the Send button. Recommend restoring auth before real sending. Not done here because it is a product decision.
- **Production database.** Local `.env.local` points at the live Supabase project. Browser verification reads real data. Write actions (thesis save, send, manual run) are only exercised with explicit care and reported as such.
- Derived "why now / angle" text is intentionally plain and factual; a model-written rationale would be a backend change and is out of scope.
