# Live-data test report

Run date: **2026-10-11** (≈23:15–23:21 IST) · Model: **`gemini-3.8-flash`** · Database: real Supabase project · Sources: real, current feeds.
No data below is fabricated. Anything that is not the strict live 24-hour result is labelled **REPLAY** or **FIXTURE**.

## 1. Live run (strict 24-hour window) — run `537a60b8…`

| Metric | Value |
|---|---|
| Sources polled / succeeded | 4 / 4 (ET Entrepreneur RSS, Inc42 Buzz RSS, YourStory RSS, Entrackr news sitemap) |
| Articles ingested | 84 (ET 20, Inc42 24, Entrackr 20, YourStory 20) |
| Rejected as older than 24 h (no AI spent) | 76 (incl. all of ET's current feed, newest item 9 Oct) |
| Within 24 h but rejected by the keyword prefilter (no AI spent) | 5 |
| Sent to Gemini | 3 |
| Qualifying Indian pre-seed/seed announcements in the last 24 h | **0** |

The three articles that reached Gemini in the live window:

| Source | Article | Published (UTC) | First seen (UTC) | Classification | Outcome |
|---|---|---|---|---|---|
| YourStory | Ecommerce firms sell goods worth Rs 24k Cr in first two days… | 11 Oct 12:05 | 11 Oct 17:45 | not a funding announcement (1.00) | rejected: `not_funding_announcement` |
| Entrackr | Hero Electronix's Tessolve Semiconductor raises $75 Mn led by Vector Line Capital | 11 Oct 15:50 | 11 Oct 17:45 | funding (0.95), stage unknown, geography not stated in text | rejected (see note) |
| Entrackr | Zetwerk raises fresh issue size to Rs 2,830 Cr… | 11 Oct 11:44 | 11 Oct 17:45 | IPO, not a funding round | rejected: `not_funding_announcement` |

*Note — Tessolve:* the live run rejected it as `wrong_geography` because the article text never states an HQ and the model was told not to guess. That exposed a recall problem, so unknown geography is now **deferred until after research** (still rejected if research cannot confirm an allowed country). The stage was also unknown, so the outcome would still be rejection (`wrong_stage`).

Conclusion: ingestion, timestamps, classification and filtering work on live data; nothing qualified in the previous 24 h, and none was invented.

## 2. REPLAY — real articles from the previous ~5 days, full funnel, real Gemini + real web research

Purpose: exercise research → scoring → draft generation on real events when the live window has none. Enabled by `npm run pipeline -- --replay-hours=120` (testing only; the stored thesis is **not** changed; recency scores are 0 because the articles are 3–4 days old). Runs `95b841c6…` and `16ae5699…`.

| Startup | Stage | Amount | Reported by | Fit score | Result |
|---|---|---|---|---|---|
| **Desible.ai** | seed | ₹32 Cr | ET | **88** | **qualified → draft generated** |
| **Credfix** | seed | ₹16.1 Cr | ET | **71** | **qualified → draft generated** |
| Zomint | seed | ₹36 Cr | ET | 56 | rejected: below_threshold |
| MoneyTruVa | seed | undisclosed | ET | 51 | rejected: below_threshold |
| TailBlaze Longevity | pre-seed | $0.3 M | Entrackr | 42 | rejected: below_threshold |
| Zinara | pre-seed | ₹3.61 Cr | ET **+ Entrackr** | 39 | rejected: below_threshold — **two reports consolidated into one round** |
| The Dough Therapy | seed | ₹5.25 Cr | ET | 34 | rejected: below_threshold |

Rejections seen on real articles across all runs: `wrong_stage` ×15 (Series A/B/C, pre-Series A, undisclosed stage), `not_funding_announcement` ×53 (incl. roundups, fund closes, results, IPO), `wrong_geography` ×1.

What the research stage produced for Desible.ai (real, cited): official site verified (`desible.ai`), Bengaluru HQ, two founders with stated backgrounds, traction statements from public sources (40+ BFSI institutions, 10M+ monthly engagements), 10 research sources recorded. Gemini listed unknowns explicitly (founded year, customers, partnerships, market) rather than inventing them. The score breakdown, positive signals, concerns and a draft email referencing these facts are visible in the app (Startup Detail / Drafts).

Totals across the three runs: 187 pipeline events, 55 Gemini calls (39 classify, 7 profile, 7 fit, 2 outreach), no errors.

> The two REPLAY drafts (Desible.ai, Credfix) are real startups but their announcements are ~4 days old; treat them as demonstration data, not leads for today.

## 3. FIXTURE integration tests (synthetic, auto-cleaned)

`tests/integration/pipeline.fixture.test.ts` runs the funnel against the real schema with a fake AI and synthetic sources named `Fixture …`: two reports (different sources, different name variants) → **one** startup, **one** round, **two** round sources with timestamps; US seed → `wrong_geography`; Series B → `wrong_stage`; qualified → draft; re-run is idempotent with zero extra AI calls; the database refuses a second live outreach for the same startup. Verified afterwards that no fixture rows remain.

Thesis versioning was proven in Postgres inside a transaction that was rolled back: invalid weights (101) rejected; saving creates version 2 as the only active row; version 1 is retained; a historical assessment keeps `thesis_id`, `thesis_version`, score and qualified flag unchanged.

## 4. Known observations

- ET Entrepreneur's funding RSS was quiet (newest item 9 Oct) while Entrackr/YourStory had newer items — source speed comparisons need several days of data.
- `generate_outreach` averages ~28 s per call and `synthesize_profile` ~10 s; a full run on ~10 candidates takes ~3 minutes, well inside the 300 s function limit with the built-in time budget.
- Roundup articles ("Funding Wrap", weekly roundups) are skipped in V1.

## 5. Production deployment check (Vercel)

URL: https://timed-funding-outreach-engine.vercel.app · checked 2026-10-11 ~23:37 IST.

- Unauthenticated requests redirect to `/login`; a forged cookie is rejected; `/api/cron/pipeline` returns 401 without the bearer token.
- Authenticated: Dashboard, Feed, Qualified, Drafts, Settings and Sources all return 200 and render the stored real data.
- "Run pipeline now" on the deployed app: run completed in ~7 s, 4/4 sources polled, 84 articles seen, 0 new (idempotent), no errors.
- GitHub Actions `pipeline-cron` (manual dispatch) called the deployed cron endpoint with the shared secret: success.
