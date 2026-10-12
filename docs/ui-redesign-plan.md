# UI redesign plan

_Written 2026-10-12, after `docs/ui-redesign-audit.md` and before implementation._

**Design question:** “What does a startup scout need to know to make the next decision?” Anything that does not answer that moves one level deeper. Nothing is deleted.

**Principles:** important first · supporting on demand · technical hidden until asked. Natural page layout (spacing, hairlines, type) instead of cards-in-cards. One accent colour. One primary action per screen.

## 1. Sitemap

```
Today                         /today                       home: daily briefing
Opportunities                 /opportunities               work queue (qualified startups)
  → Startup detail            /opportunities/[id]          decision header → why now → why it fits → …
Drafts                        /drafts                      review queue
  → Draft                     /drafts/[id]                 focused reading surface
Discoveries                   /discoveries                 broader funding feed (+ “Show rejected”)
Settings                      /settings                    Investment thesis (default)
  → Investment thesis         /settings                    thesis text · Focus · Qualification · Priorities · Advanced scoring · Versions
  → Discovery                 /settings/discovery          sources + health + (L3) performance
  → Integrations              /settings/integrations       Gmail drafts · Resend sending · scheduler
  → System                    /settings/system             health · run now + progress · run history · 24 h numbers · event log
Global                        ⌘K search · “System healthy” chip → system sheet · theme toggle
Public                        /                            landing (restyled, CTA → Today)
```

Sidebar (desktop, collapsible): `Today · Opportunities · Drafts` / `Discoveries` / `Settings`. Phones: bottom tab bar with the same five destinations.

## 2. Migration map (old → new)

| Old route | New route | How |
|---|---|---|
| `/dashboard` | `/today` | permanent redirect; system content → top-bar chip, system sheet, Settings → System |
| `/qualified` | `/opportunities` | permanent redirect |
| `/startups/[id]` | `/opportunities/[id]` | permanent redirect (any startup id, incl. rejected ones) |
| `/feed` | `/discoveries` | permanent redirect |
| `/sources` | `/settings/discovery` | permanent redirect |
| `/drafts` | `/drafts` (+ `/drafts/[id]`) | same URL, new design |
| `/settings` | `/settings` | same URL, new design |
| `/` | `/` | restyled |
| `/api/*` | unchanged | plus new read-only `GET /api/search?q=` for ⌘K |

Redirects live in `next.config.ts` (`redirects()`), so old bookmarks and any external links keep working.

## 3. Screen hierarchy (what is L1 / L2 / L3 on each screen)

**Today** — L1: greeting, “N opportunities need your attention · M drafts ready”, priority list (name, fit, funding, recency, sector/location, one-line description, **Why now**, **Recommended angle**, `Review`), “Needs attention” strip only when something is actually wrong. L2: system sheet, Scan now. L3: nothing (all system detail is in Settings → System).

**Opportunities** — L1: segmented `All · New · Draft ready · Reviewed`, search-in-page, list rows (name, sector, stage·amount, age, fit, description, why now, draft state). L2: `Filters` popover (stage, sector, funding, min score, age, location, source), row menu (open draft, visit website, read article). L3: none.

**Startup detail** — L1 (in this order, after a design review moved Outreach up): decision header, Why now, Why it fits, Outreach (angle, talking points, draft state, who to contact), Company snapshot, Product & traction, Founders. L2: score breakdown, contact details table + re-run, Sources and evidence. L3: System details.

**Drafts** — L1: queue; draft reading surface + one primary. L2: edit, copy, Gmail, mark sent, reject. L3: provider/from address.

**Discoveries** — L1: qualified/in-progress funding events; rejected hidden by default. L2: coverage per event, filtered articles. L3: raw reason codes (tooltips).

**Settings** — L1: thesis text, Focus, Qualification. L2: Priorities, Advanced scoring, versions. L3: source technical details, run internals, event log.

## 4. Component system

All new components live in `src/components/` grouped by purpose. Server components by default; `"use client"` only where state/events are needed (marked ✱).

| Group | Components |
|---|---|
| Shell | `AppShell`, `Sidebar` ✱ (collapse), `MobileTabBar`, `TopBar`, `SystemStatus` ✱ (chip + sheet trigger), `SystemSheet` ✱, `ThemeToggle` ✱ |
| Page | `PageHeader`, `CompactStat`, `Section`, `DisclosureSection` (native `<details>`), `DetailGroup` (definition grid), `EmptyState`, `LoadingState`/skeletons (`loading.tsx`) |
| Opportunity | `OpportunityRow`, `OpportunityCard` (Today), `FitIndicator`, `FundingMeta`, `WhyNow`, `RecommendedAngle`, `StatusLabel`, `FounderList`, `EvidenceList`, `ScoreBreakdown` |
| Lists/filters | `SegmentedControl` ✱, `FilterPopover` ✱, `RowMenu` ✱ |
| Drafts | `DraftViewer` ✱, `DraftActions` ✱, `ConfirmDialog` ✱, `WhyThisMessage` |
| Search | `CommandSearch` ✱ (native `<dialog>`, combobox semantics, ⌘K) |
| Pipeline | `PipelineHealth` (summary), `PipelineProgress` ✱ (existing, restyled + simple 5-step summary), `RunPipelineButton` ✱ |
| Settings | `SettingsNav`, `ThesisForm` ✱ (restructured), `ChoiceInput` ✱ (kept, restyled), `SourceList` ✱ |

Derivation/logic (pure, unit-tested) in `src/lib`: `labels.ts` (status vocabulary), `opportunities.ts` (view models, filters, why-now/angle derivation), `sources/health.ts`, `greeting.ts`.

## 5. Design tokens (centralised in `src/app/globals.css`)

Semantic CSS variables exposed as Tailwind utilities through `@theme`; dark mode swaps the variable values (no palette remapping).

| Token | Light | Use |
|---|---|---|
| `bg` / `surface` / `sunken` | #ffffff / #ffffff / #f6f6f4 | canvas / reading surfaces / sidebar, quiet fills |
| `ink` / `ink-2` / `ink-3` | #1b1b1d / #4a4a50 / #6c6c73 | primary / secondary / metadata (≥4.5:1 on white) |
| `line` / `line-strong` | #ebebe8 / #d8d8d4 | hairlines / control borders |
| `accent` / `accent-soft` / `accent-ink` | #0b5cd5 / #eaf1fd / #fff | the only brand colour: primary actions, focus, active nav |
| `ok` / `warn` / `bad` (+ `-soft`) | #1f7a4d / #8a5a00 / #b42318 | status text/dots only, never large fills |

Type scale (Inter via `next/font`, system fallback): `page` 26/32 600 −0.02em · `heading` 17/24 600 · `name` 19/26 600 · `body` 15/24 · `meta` 13/20 · `label` 12/16 500 (uppercase only for micro-labels). Numerals use `tabular-nums`.
Radii: `sm` 6 · `md` 10 · `lg` 14 (consistent). Shadows: one subtle `popover`/`sheet` shadow; none on resting content.
Motion: `--dur-fast` 120 ms, `--dur` 200 ms, one easing curve; all transitions are disabled under `prefers-reduced-motion`.
Focus: 2 px accent ring with offset, on every interactive element (`:focus-visible`).

## 6. Language (status vocabulary)

Implemented once in `lib/labels.ts`; machine codes stay in the database and in `title`/L3 views.
`below_threshold → Not a fit` · `already_contacted → Previously contacted` · `announcement_too_old → Too old` · `wrong_stage → Stage outside thesis` · `wrong_geography → Outside target market` · `not_funding_announcement → Not a funding announcement` · `processing/discovered → Reviewing` · `enriching → Researching` · `generated/draft_created → Needs review` · `approved → Approved` · `sent → Sent` · `publicly_confirmed → Published by the company` · …

## 7. Derived (not invented) content

| UI text | Derivation (all from stored data) |
|---|---|
| Fit score / label | `fit_assessments.total_score`; “Strong fit” ≥ 85, “Good fit” 70–84, else “Possible fit” (label always paired with the number) |
| Priority | **Not implemented in the product → not shown** |
| Why now | only facts *not* already in the funding line: who led / backed the round and hours left in the thesis’ announcement window (“Led by Accel. 22h left in your 24h window.”). The detail page lists announcement time, publications, investors, window |
| Recommended angle | the assessment’s strongest positive signal(s); falls back to the research profile’s product line; hidden if neither exists |
| Why it fits | `positive_signals` (top 4) + `concerns` shown honestly |
| Why this message (drafts) | checks computed on the real draft: mentions the round, addresses the recipient by name, recipient address verification state, number of research sources |
| Needs attention | source/pipeline health rules + live drafts with no recipient email |

## 8. Implementation phases and gates

| Phase | Scope | Gate |
|---|---|---|
| A | audit, plan, tokens | docs committed; `typecheck` |
| B | AppShell, sidebar, top bar, search, system sheet, redirects | `typecheck`, `lint`, manual nav check |
| C | Today | typecheck/lint; page renders against live data |
| D | Opportunities + Startup detail | same + contact re-run works |
| E | Drafts + Draft page | edit/approve/send-guard/mark-sent/reject verified |
| F | Discoveries | filters, rejected toggle |
| G | Settings (thesis, discovery, integrations, system) | thesis save round-trip, source toggle, manual run |
| H | responsive, a11y, loading/empty states, landing | viewport + keyboard checks |
| I | regression | lint, typecheck, test, **build**; functionality matrix verified |

## 9. Functionality preservation

The checklist in audit §3 is expanded into `docs/ui-functionality-matrix.md` (old location → new location → visibility → verified). A capability is only marked verified after it was exercised (test, live read/write, or browser check) — never by inspection alone.

## 10. Known product contradictions / decisions

* The brief mentions “priority”; no such field exists. Resolved by using fit score, with a documented hook (`lib/opportunities.ts`) if a priority score is later added.
* The brief lists “authentication” among things to preserve; the product intentionally has no UI login (2026-10-12 decision, README Limitations). Preserved as-is; the redesign neither adds nor hides it.
* “Why now / recommended angle” are derived text, not model output (backend is out of scope). Listed as a limitation in the final report.

## 11. Decisions made during implementation

* **Today “needs attention”** = qualified, not yet approved/sent/rejected, assessed within the last 72 h (covers a weekend away). The **New** filter on Opportunities is stricter (24 h).
* **Source names** show without feed suffixes (“Inc42 — Buzz” → “Inc42”); the full name is in Settings → Discovery → Technical details.
* **Design review** (ui-ux-designer agent, on rendered screenshots) drove: Fit bar in ink not accent (accent = actions), verdict merged into the Fit indicator, repeated facts removed from the detail page, Outreach moved directly after “Why it fits”, sticky draft action bar with status and feedback inside it, `--control` border token for 3:1 control contrast, whole-card keyboard focus, Fit announced as one phrase to screen readers.
* **Dialog CSS bug found by browser testing**: unlayered `dialog` rules overrode Tailwind utilities (sheet rendered full-width); moved into `@layer base`.
