# Timed Funding Outreach Engine

**Document:** Product Requirements Document  
**Version:** 1.0  
**Status:** V1 Build Specification  
**Primary User:** Rohit — Accelerator Recruitment / Startup Scouting  
**Initial Market:** India  
**Primary Funding Stages:** Pre-seed and Seed  
**Deployment Target:** Vercel  
**Database:** Supabase  
**Runtime AI:** Gemini Flash  
**Development Agent:** Claude Code

---

# 1. PURPOSE OF THIS DOCUMENT

This document is the permanent source of truth for the Timed Funding Outreach Engine.

Claude Code must use this PRD to understand:

- what product is being built;
- why it exists;
- who it serves;
- what the original assignment requires;
- what product decisions have been made;
- what is in scope for V1;
- what is explicitly out of scope;
- how the system should work end-to-end;
- what data must be stored;
- how qualification works;
- how the accelerator thesis works;
- how the system integrates with Supabase;
- how the system uses Gemini Flash;
- what each engineering phase contains;
- how to determine when a phase is complete;
- what phase comes next;
- what must be tested before the project can be considered complete.

Claude should not treat individual coding sessions as isolated tasks.

Every engineering decision should support the complete end-to-end product described in this document.

---

# 2. ORIGINAL ASSIGNMENT CONTEXT

The assignment describes Rohit, who manages recruitment for an early-stage startup accelerator.

Rohit's job is to identify startups that have recently announced a seed or pre-seed funding round and reach out during the period when founders have fresh capital and are evaluating what they need next.

The assignment explicitly describes the desired timing as approximately thirty to sixty days following funding, while emphasizing that discovering and approaching startups quickly is significantly more valuable than waiting months.

Rohit's current workflow is manual.

He monitors only a handful of startup-news sources, bookmarks announcements and tracks companies in a spreadsheet.

According to the assignment, he believes this causes him to miss roughly 30–40% of relevant announcements. Once he discovers a startup, he also spends significant time researching the company, determining whether it fits the accelerator and writing personalized outreach.

The desired future experience is very different.

Rohit should begin each morning with personalized outreach drafts already prepared for startups that:

- announced funding recently;
- fit the accelerator's investment/recruitment thesis;
- have not already been contacted.

The assignment explicitly says he should not receive a list that he has to manually research or sort.

The research, assessment and personalization should already be complete.

If a startup is not a fit, Rohit should not have to deal with it.

If it is a fit, the time from announcement to outreach opportunity should be measured in hours rather than weeks.

The system must also prevent duplicate outreach.

The accelerator thesis and fit criteria must be configurable through Supabase so that changing the thesis affects future assessments without requiring code changes.

The assignment's final instruction is to build and deploy this automated funding outreach pipeline.

---

# 3. ASSIGNMENT NON-NEGOTIABLES

The following requirements come directly from the assignment and must not be removed or weakened.

## Live external data

The application must use live external data wherever possible.

The final application must demonstrate that it can process real data that exists at the time of submission.

Hardcoded startup examples may be used for:

- automated tests;
- fixtures;
- fallback demonstrations.

They must not be the primary production workflow.

---

## Gemini Flash

All runtime AI tasks in the application must use Gemini Flash.

Claude Code is the engineering/development agent only.

The deployed application must not depend on:

- Claude API;
- Anthropic API;
- OpenAI API;
- another LLM provider

for any AI task that belongs to the product.

This is explicitly required by the assignment.

---

## Vercel

The final product must be deployable on Vercel.

The final submission requires a working public URL.

---

## GitHub

The completed project must be stored in a GitHub repository and the repository link must be part of the final submission.

---

## Components Map

The project must contain a clear Components Map explaining the application architecture and major system components.

Create this at:

`docs/components-map.md`

---

# 4. PRODUCT VISION

Build an autonomous funding-discovery and outreach-preparation system for an early-stage startup accelerator.

The product transforms this:

```text
Rohit checks websites
→ finds funding announcement
→ researches startup
→ checks accelerator fit
→ finds founder information
→ drafts outreach
→ tracks company manually
```

into:

```text
Funding announcement becomes public
                ↓
System discovers announcement
                ↓
System identifies startup + funding round
                ↓
System removes irrelevant companies
                ↓
System deduplicates repeated coverage
                ↓
System researches startup
                ↓
System loads current accelerator thesis
                ↓
System evaluates startup
                ↓
Qualified?
        ↓ YES
System generates personalized outreach
                ↓
Draft becomes available to Rohit
                ↓
Rohit reviews and sends
```

The primary value proposition is:

> Turn newly announced startup funding rounds into qualified, researched and personalized outreach opportunities within hours.

---

# 5. PRODUCT PRINCIPLE

This is not a startup-news dashboard.

This is not a chatbot.

This is not merely an AI email generator.

This is an automated event-driven pipeline.

The starting event is:

> A potentially relevant funding announcement becomes public.

The end state is:

> A personalized draft exists for a qualified startup and Rohit only needs to review it.

Every system component should move the company closer to that final state.

---

# 6. PRIMARY USER

## Rohit

Rohit manages recruitment/scouting for an early-stage startup accelerator.

His responsibilities include:

- identifying promising recently funded companies;
- evaluating whether they fit the accelerator;
- prioritizing high-potential companies;
- researching founders and products;
- reaching out at the right moment;
- avoiding duplicate or low-quality outreach.

Rohit is not expected to be technical.

Routine changes to investment criteria should therefore be possible through the product UI rather than requiring SQL, code changes or redeployment.

---

# 7. USER OUTCOME

A successful morning for Rohit looks like:

```text
Dashboard

New funding events: 17

Automatically rejected: 11
Already contacted: 1
Qualified: 5

Drafts ready: 5
```

Rohit opens the five qualified companies.

For each he can see:

- startup;
- founders;
- funding amount;
- funding stage;
- funding source;
- announcement timing;
- product description;
- important research;
- why the startup fits;
- fit score;
- concerns;
- personalized draft.

Rohit should not need to manually inspect the other eleven rejected companies unless he deliberately opens administrative/debugging views.

---

# 8. V1 MARKET SCOPE

The assignment does not prescribe a geographic market.

For V1, the product decision is:

> Focus exclusively on Indian startups.

This is a product decision, not a requirement from the original assignment.

The architecture should remain extensible so other markets can later be added through configuration.

---

# 9. V1 FUNDING-STAGE SCOPE

The primary stages are:

- Pre-seed
- Seed

This follows the scenario in the original problem statement.

The application should normalize variations such as:

```text
pre seed
pre-seed
seed round
seed funding
seed investment
```

into canonical values.

Default allowed stages must live in Supabase.

Do not permanently hardcode them into business logic.

---

# 10. V1 ACCELERATOR THESIS

The original problem statement does not provide a sector thesis.

Therefore the V1 thesis is a project decision.

Initial thesis:

> We identify Indian pre-seed and seed startups building AI-native B2B software or defensible deep technologies. We prioritize vertical AI, enterprise AI, agentic workflows, developer infrastructure, robotics, spacetech, semiconductor technology and industrial automation. We may also consider climate and health technologies where meaningful proprietary technology exists. We prefer companies operating in large commercial markets, showing credible early validation and led by founders with relevant technical or domain expertise. We avoid undifferentiated AI wrappers, purely consumer novelty applications and companies without evidence of technical differentiation.

This thesis was chosen because the Indian early-stage funding market currently shows strong investor interest in AI, deeptech and adjacent technically defensible sectors.

However:

**The thesis must remain editable.**

The application must not assume that AI/deeptech remains the accelerator's strategy forever.

---

# 11. HARD ELIGIBILITY RULES

Before expensive startup research or fit scoring, apply deterministic filters.

Default V1 eligibility:

```text
Indian startup
AND
Pre-seed OR Seed
AND
Funding announcement <= 24 hours old
AND
Startup has not previously been contacted
```

Failure of any hard requirement means the startup should not progress to outreach.

Store the reason.

Possible rejection codes:

```text
not_funding_announcement
wrong_geography
wrong_stage
announcement_too_old
already_contacted
duplicate_event
insufficient_identity
```

These should be machine-readable.

---

# 12. 24-HOUR RULE

The core operational discovery window is:

**previous 24 hours**

The assignment explicitly asks for startups that announced a funding round in the previous twenty-four hours.

The database must distinguish:

`source_published_at`

from:

`first_seen_at`

Example:

```text
Source published:
2026-10-11 09:15 IST

Our system discovered:
2026-10-11 09:47 IST

Ingestion delay:
32 minutes
```

This allows the product to later evaluate source performance.

---

# 13. SOURCE STRATEGY

V1 should use multiple sources because one of Rohit's existing problems is that funding announcements appear in sources he does not follow.

Initial source priority:

```text
Tier 1

ET Entrepreneur Funding
Inc42 Buzz
Entrackr
YourStory
```

Catch-all / future source:

```text
web/news search
```

Additional future sources:

```text
VCCircle
ETtech
Business Standard
Moneycontrol
VC portfolio announcements
company blogs
founder announcements
investor announcements
startup databases
```

The application must use a modular source-adapter architecture.

Do not tightly couple the pipeline to one website.

---

# 14. SOURCE PERFORMANCE

Recency is strategically important.

The system should eventually be capable of measuring each source by:

| Metric | Meaning |
|---|---|
| Coverage | How many relevant funding events the source catches |
| First-report rate | How often this source is the earliest observed source |
| Publication delay | Difference between its publication time and earliest observed report |
| Ingestion delay | Difference between publication time and our discovery time |
| Unique discovery rate | Events found only through this source |
| Precision | Percentage of candidate articles that are actually relevant |
| Reliability | Whether ingestion consistently succeeds |

Do not fabricate these metrics before enough data exists.

The system should collect the timestamps necessary to calculate them later.

---

# 15. SOURCE INGESTION PRINCIPLE

Do not perform expensive AI research on every article.

Use a funnel.

```text
Fetch candidate article metadata
        ↓
Store raw candidate
        ↓
Fast funding relevance classification
        ↓
Structured extraction
        ↓
Hard filters
        ↓
Deduplication
        ↓
Research only promising startups
```

The earlier the rejection can happen safely, the less unnecessary work should be performed.

---

# 16. CORE PIPELINE

The complete logical pipeline is:

```text
1. Scheduler triggers pipeline

2. Enabled sources are polled

3. New articles are normalized

4. Duplicate article URLs are removed

5. New articles are stored

6. Gemini Flash determines:
   - funding event?
   - startup?
   - India?
   - stage?
   - amount?
   - investors?

7. Hard eligibility filters run

8. Startup identity resolution runs

9. Funding-event deduplication runs

10. Previous outreach check runs

11. Qualified candidate is researched

12. Active thesis is loaded from Supabase

13. Current scoring configuration is loaded

14. Gemini Flash evaluates startup

15. Application validates score

16. Threshold is checked

17. Below threshold:
    reject silently

18. Above threshold:
    generate personalized outreach

19. Draft is stored / created in email provider

20. Pipeline results are recorded

21. Dashboard updates
```

This is the central workflow.

Claude must protect this workflow from becoming fragmented across independent features.

---

# 17. RUNTIME AI ARCHITECTURE

All runtime AI tasks use Gemini Flash.

There should be separate focused Gemini operations.

## AI Task A — Funding classification and extraction

Input:

- headline;
- snippet;
- article text if available;
- source;
- publication date.

Output should include:

```json
{
  "is_funding_announcement": true,
  "company_name": "Example AI",
  "is_indian_startup": true,
  "funding_stage": "seed",
  "funding_amount": 2500000,
  "funding_currency": "USD",
  "investors": ["Example Ventures"],
  "confidence": 0.96
}
```

Use schema validation.

Do not blindly trust model output.

---

## AI Task B — Research synthesis

Research should be converted into structured startup information.

Potential fields:

```text
company_name
website
domain
description
sector
subsector
business_model
hq_city
hq_country
founders
founder_background
product
target_customer
technology
traction
customers
partnerships
funding_history
market
competitive_differentiation
source_urls
```

Unknown facts must remain unknown.

The model must never invent information merely to fill fields.

---

## AI Task C — Fit assessment

Input:

```text
startup research
+
active accelerator thesis
+
current scoring configuration
```

Output:

```json
{
  "criterion_scores": {
    "sector_fit": 22,
    "technology_defensibility": 12,
    "stage_fit": 15,
    "geography_fit": 10,
    "market_attractiveness": 8,
    "founder_quality": 7,
    "traction": 6,
    "recency": 5
  },
  "positive_signals": [],
  "concerns": [],
  "reasoning": "",
  "confidence": 0.86
}
```

Application code calculates the total.

The LLM must not be responsible for authoritative arithmetic.

---

## AI Task D — Outreach generation

Only run if:

```text
hard filters passed
AND
startup not previously contacted
AND
score >= current threshold
```

Output:

```json
{
  "subject": "...",
  "body": "..."
}
```

Email must be grounded in researched information.

Do not generate generic mass-outreach copy with only a company name substituted.

---

# 18. DEFAULT FIT SCORE

Initial scoring framework:

| Criterion | Maximum |
|---|---:|
| Sector / thesis fit | 25 |
| Technology defensibility | 15 |
| Stage fit | 15 |
| Geography fit | 10 |
| Market attractiveness | 10 |
| Founder/team evidence | 10 |
| Traction / validation | 10 |
| Recency | 5 |
| **Total** | **100** |

Initial qualification threshold:

```text
70 / 100
```

The weights and threshold are configuration, not permanent code.

---

# 19. SCORING INTERPRETATION

## Sector fit

Strong examples:

```text
Vertical AI
Enterprise AI
AI-native B2B SaaS
Agentic workflows
Developer tools
AI infrastructure
Deeptech
Robotics
Spacetech
Semiconductors
Industrial automation
```

Adjacent areas:

```text
Climate technology
Health technology
Fintech infrastructure
```

Sector terminology may evolve.

Use the thesis stored in Supabase as the final authority.

---

## Technology defensibility

Look for evidence of:

```text
proprietary technology
IP
technical research
unique datasets
workflow integration
switching costs
network effects
domain expertise
hard-to-reproduce infrastructure
```

Do not automatically award strong scores simply because the company describes itself as AI.

---

## Founder quality

Do not ask Gemini:

> Is this a good founder?

Instead evaluate evidence such as:

```text
relevant work experience
technical expertise
domain expertise
previous startups
leadership roles
research history
successful execution
cofounder complementarity
```

Score should reflect evidence quality.

---

## Traction

Possible evidence:

```text
paying customers
revenue
pilots
users
growth
enterprise deployments
partnerships
contracts
repeat usage
customer retention
```

Pre-seed companies should not be unfairly penalized for naturally having less traction than later-stage companies.

---

# 20. SUPABASE'S ROLE

Supabase is both:

1. the application's persistent operational database;
2. the configuration layer for the accelerator thesis.

Claude Code should connect directly to the Supabase project using available authenticated tooling.

All schema changes must also exist as migrations in the repository.

Do not create important database state only through undocumented manual dashboard changes.

---

# 21. THESIS CONFIGURATION

Rohit should be able to edit:

```text
Target geography
Allowed funding stages
Included sectors
Preferred subsectors
Excluded sectors
Preferred business models
Maximum announcement age
Minimum fit score
Scoring weights
Natural-language investment thesis
```

Changes must be stored in Supabase.

Future startup assessments must use the new thesis.

Historical assessments must remain tied to the thesis version used when the score was generated.

Example:

```text
Monday:
Thesis v3

AI + Deeptech

Startup A:
82/100

Tuesday:
Rohit changes thesis.

Thesis v4

AI + Deeptech + Climate Tech

Startup B:
evaluated using v4

Startup A:
still records v3
```

---

# 22. THESIS EDITOR UX

The product should expose a settings page.

Suggested configuration controls:

```text
Investment Geography
[India]

Allowed Stages
[x] Pre-seed
[x] Seed
[ ] Series A

Core Sectors
[AI/ML]
[Deeptech]
[Enterprise SaaS]

Preferred Subsectors
[Vertical AI]
[Robotics]
[Spacetech]
[...]

Excluded Areas
[...]

Preferred Business Models
[x] B2B
[x] B2B2C
[ ] B2C

Maximum Announcement Age
[24] hours

Minimum Score
[70]

Scoring Weights
Sector                 [25]
Technology             [15]
...

Natural Language Thesis
[............................]

SAVE THESIS
```

Rohit should not need to interact directly with raw database rows.

---

# 23. DATA MODEL

The exact database design may evolve during implementation, but it must preserve the following concepts.

## sources

Represents external funding/news sources.

Important fields:

```text
id
name
type
base_url
feed_url
enabled
poll_interval_minutes
last_polled_at
created_at
updated_at
```

---

## funding_articles

Represents individual pieces of source content.

```text
id
source_id
source_url
canonical_url
headline
snippet
raw_text
source_published_at
first_seen_at
processed_at
processing_status
classification_confidence
created_at
updated_at
```

---

## startups

Canonical company record.

```text
id
name
normalized_name
website
domain
linkedin_url
description
sector
subsector
business_model
hq_city
hq_country
founded_year
enrichment_status
created_at
updated_at
```

Use the domain as a strong identity signal where possible.

---

## founders

```text
id
startup_id
name
role
linkedin_url
background_summary
created_at
updated_at
```

---

## funding_rounds

```text
id
startup_id
stage
amount
currency
announcement_date
earliest_source_published_at
created_at
updated_at
```

---

## funding_round_sources

Associates multiple reports with one event.

```text
id
funding_round_id
funding_article_id
source_published_at
first_seen_at
created_at
```

This table is important for source-speed analysis.

---

## investors

```text
id
name
website
created_at
updated_at
```

---

## funding_round_investors

```text
funding_round_id
investor_id
is_lead
```

---

## accelerator_theses

```text
id
name
description
natural_language_thesis
active
version
allowed_countries
allowed_stages
included_sectors
preferred_subsectors
excluded_sectors
preferred_business_models
max_announcement_age_hours
minimum_fit_score
created_at
updated_at
```

---

## scoring_criteria

```text
id
thesis_id
criterion_key
display_name
description
weight
enabled
sort_order
created_at
updated_at
```

---

## fit_assessments

```text
id
startup_id
funding_round_id
thesis_id
thesis_version
total_score
qualified
criterion_scores_json
positive_signals
concerns
reasoning
confidence
model_name
assessed_at
created_at
```

---

## outreach

```text
id
startup_id
funding_round_id
fit_assessment_id
recipient_name
recipient_email
subject
body
draft_provider
external_draft_id
status
created_at
updated_at
sent_at
```

Possible statuses:

```text
generated
draft_created
approved
sent
cancelled
```

---

## pipeline_runs

```text
id
started_at
completed_at
status
sources_polled
articles_found
articles_processed
funding_events_found
qualified_startups
drafts_generated
errors_json
created_at
```

---

## pipeline_events

```text
id
pipeline_run_id
entity_type
entity_id
event_type
message
metadata_json
created_at
```

Used for debugging and auditability.

---

# 24. DEDUPLICATION

Two separate problems must be solved.

## Article/event duplication

The same fundraising may appear on:

```text
ET Entrepreneur
Inc42
Entrackr
YourStory
```

These are four articles.

They should result in:

```text
1 startup
1 funding round
4 source records
```

Useful identity evidence:

```text
company domain
normalized company name
round stage
announcement date
funding amount
investors
```

Use deterministic rules first.

Gemini may assist only with ambiguous cases.

---

## Outreach duplication

The assignment explicitly says the system must not send duplicate outreach to a startup that has already been contacted.

V1 policy:

```text
startup previously contacted
=
do not generate another outreach
```

Protect this through:

- application checks;
- database constraints where appropriate.

---

# 25. RESEARCH / ENRICHMENT

Once a company survives initial filters, enrich it.

Preferred information hierarchy:

```text
Official company website
Official company funding announcement
Investor announcement
Reliable startup publication
Reliable business publication
Public founder/company profile
Other credible sources
```

Preserve URLs used for important research facts.

Never invent missing:

```text
revenue
customers
founder credentials
funding amount
location
investors
traction
partnerships
```

Insufficient data should reduce confidence rather than cause hallucination.

---

# 26. OUTREACH EXPERIENCE

Qualified startup example:

```text
Company:
Nimbus AI

Round:
$2.5M Seed

Fit:
88/100

Top reasons:
- Vertical AI
- Enterprise use case
- Strong founder domain experience
- Credible pilots

Concerns:
- Very early revenue evidence

Draft:
Ready
```

Generated email should typically include:

```text
founder/team name where verified
congratulations tied to actual round
specific reference to product
specific fit reason
short explanation of accelerator relevance
low-friction CTA
```

Avoid:

```text
fake personalization
exaggerated praise
invented facts
very long emails
generic "we love what you're doing"
```

---

# 27. HUMAN-IN-THE-LOOP REQUIREMENT

The product should create drafts.

It must not automatically send outreach in V1.

The assignment asks for emails ready for Rohit to read, approve and send.

Preferred future integration:

```text
Gmail Draft API
```

If Gmail credentials are unavailable during development:

- implement a `DraftProvider` abstraction;
- store generated drafts in Supabase;
- show them in the dashboard;
- do not pretend Gmail creation succeeded.

---

# 28. USER INTERFACE

V1 should include the following product surfaces.

## Dashboard

Show:

```text
articles discovered today
funding events found
eligible startups
qualified startups
rejected startups
drafts generated
pipeline health
average ingestion delay
```

---

## Funding Feed

Show discovered funding events.

Fields:

```text
startup
funding stage
amount
earliest source
published time
first seen
age
pipeline status
```

---

## Qualified Startups

Show:

```text
company
sector
funding
fit score
main fit reasons
concerns
research status
draft status
```

---

## Startup Detail

Show:

```text
company profile
founders
funding round
source articles
research
fit assessment
criterion breakdown
positive signals
concerns
draft email
```

---

## Drafts

Show prepared outreach.

Support review.

Automatic sending is out of V1 scope.

---

## Thesis Settings

Allow full thesis configuration.

---

## Sources

Show:

```text
enabled status
last poll
last successful poll
latest error
articles discovered
```

Future versions may show source-performance analytics.

---

# 29. V1 TECHNICAL ARCHITECTURE

Preferred stack:

```text
Next.js
TypeScript
App Router
Tailwind CSS
Supabase
Gemini Flash
Vercel
```

Use a reasonable component library if useful.

Do not create unnecessary microservices.

Keep the architecture explainable during an examination/demo.

---

# 30. RECOMMENDED CODE STRUCTURE

A reasonable structure is:

```text
src/
  app/
    dashboard/
    funding/
    startups/
    drafts/
    settings/
    api/

  components/

  lib/
    supabase/
    gemini/
    sources/
    research/
    qualification/
    scoring/
    deduplication/
    outreach/
    pipeline/

  types/

supabase/
  migrations/

docs/
  components-map.md

tests/
```

Suggested provider/service abstractions:

```text
FundingSourceAdapter
AIService
ResearchProvider
DraftProvider
```

Do not create abstractions merely for architectural elegance.

They must solve actual replaceability or maintainability problems.

---

# 31. PIPELINE SCHEDULING

The workflow should support:

```text
manual run
+
scheduled run
```

Production should use a Vercel-compatible scheduled mechanism.

Target frequency:

```text
approximately every 1–3 hours
```

Do not require the user to keep a browser window open.

Protect scheduled endpoints with authentication/secrets.

---

# 32. SECURITY

Never expose:

```text
Supabase service role key
Gemini API key
Gmail secrets
refresh tokens
cron secrets
```

to the browser.

Never commit them.

Privileged operations must execute server-side.

Validate:

- URLs;
- API payloads;
- Gemini responses;
- thesis settings;
- scoring weights.

Avoid arbitrary server-side URL fetching without safety controls.

---

# 33. ENVIRONMENT VARIABLES

Expected categories:

```text
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY

GOOGLE_GENERATIVE_AI_API_KEY
GEMINI_MODEL

CRON_SECRET

GOOGLE_CLIENT_ID
GOOGLE_CLIENT_SECRET
GOOGLE_REFRESH_TOKEN
```

The exact variables may change based on implementation.

Create:

`.env.example`

Never put real secret values inside it.

---

# 34. OBSERVABILITY

The product should make pipeline failures understandable.

Do not silently swallow errors.

For each pipeline run, capture:

```text
source failures
article failures
classification failures
research failures
scoring failures
draft failures
```

One failed source/article must not automatically terminate the whole pipeline.

Prefer partial success.

---

# 35. TESTING REQUIREMENTS

Critical deterministic logic should have automated tests.

Minimum coverage:

```text
Hard filters

India + Seed + 3h old
→ pass

India + Series B
→ fail

US + Seed
→ fail

India + Seed + 30h
→ fail
```

Deduplication:

```text
same startup
same round
two publications
→ one canonical funding event
```

Outreach:

```text
startup previously contacted
→ no new outreach
```

Scoring:

```text
criterion cannot exceed max weight
weights validate correctly
total computed in code
```

Thesis:

```text
change active thesis
→ future assessments use change
→ historical assessment unchanged
```

---

# 36. LIVE-DATA ACCEPTANCE REQUIREMENT

Before V1 is called complete, run the actual system against live sources.

The test should demonstrate as much as current data permits.

Capture:

```text
source
article
source timestamp
first-seen timestamp
classification
startup identity
funding stage
hard-filter result
research result
score
qualification result
draft result
```

If no qualifying Indian seed/pre-seed startup happened in the previous 24 hours, do not fabricate one.

Use real ingestion plus clearly labelled historical fixtures for full-flow testing.

---

# 37. SUCCESS CRITERIA FOR V1

V1 is complete only when all of the following are true:

```text
Application runs successfully.

At least one live source is operational.
Preferably multiple sources are operational.

Live articles can be ingested.

Gemini Flash can classify funding announcements.

Indian pre-seed/seed events can be identified.

24-hour eligibility works.

Duplicate funding coverage can be consolidated.

Previously contacted startups are blocked.

Startup research works.

Active thesis comes from Supabase.

Scoring uses current Supabase configuration.

Updating thesis requires no source-code changes.

Qualified companies receive generated personalized drafts.

Drafts are available for human review.

Pipeline events are stored.

Dashboard exposes pipeline results.

Critical deterministic logic is tested.

Production build succeeds.

Components Map exists.

README exists.

GitHub repository exists.

Code has been pushed.

Application is deployable to Vercel.

No runtime AI uses Claude.
```

---

# 38. OUT OF SCOPE FOR V1

Unless necessary for the core requirements, do not prioritize:

```text
fully autonomous sending
CRM integration
WhatsApp outreach
LinkedIn outreach
multi-user organizations
complex RBAC
billing
mobile application
advanced source analytics
machine-learned ranking model
international startup coverage
full investment portfolio management
automatic follow-up sequences
```

A complete narrow product is better than a broad unfinished product.

---

# 39. DEVELOPMENT PHASES

Claude must work through the following phases sequentially.

A phase is complete only when its exit criteria pass.

Do not jump ahead merely because a future component is easier or more interesting.

---

# PHASE 0 — ENVIRONMENT & PROJECT AUDIT

## Objective

Understand the environment before creating or modifying the project.

## Tasks

Inspect:

```text
working directory
existing application files
package manager
Node version
Git status
GitHub CLI
GitHub authentication
Supabase tooling
Supabase authentication
Vercel tooling
existing environment variables
```

Do not overwrite unrelated user work.

## Deliverable

Document current environment state.

## Exit criteria

Claude knows:

```text
where application will live
whether repo already exists
whether Supabase is authenticated
whether GitHub is authenticated
whether Vercel is authenticated
which credentials are missing
```

## Next phase

PHASE 1 — Application Foundation

---

# PHASE 1 — APPLICATION FOUNDATION

## Objective

Create the basic application structure.

## Tasks

Set up:

```text
Next.js
TypeScript
App Router
Tailwind
basic component system
environment validation
server/client boundaries
Supabase client setup
routing structure
```

Create initial README skeleton.

Create:

`PROJECT_STATUS.md`

## Exit criteria

```text
app runs locally
TypeScript works
basic navigation works
Supabase clients compile
environment validation exists
no major build errors
```

## Next phase

PHASE 2 — Supabase Database

---

# PHASE 2 — SUPABASE DATABASE

## Objective

Create persistent system state and configuration.

## Tasks

Connect directly to Supabase through available authenticated tooling.

Create migrations.

Create the tables defined in this PRD or an improved equivalent.

Seed:

```text
initial accelerator thesis
default scoring criteria
initial source definitions
```

Do not destructively alter unrelated data.

## Verify

Read the resulting schema after migration.

## Exit criteria

```text
migrations stored in repo
migrations successfully applied
core tables exist
initial thesis exists
scoring configuration exists
sources exist
application can read/write safely
```

## Next phase

PHASE 3 — Source Ingestion

---

# PHASE 3 — SOURCE INGESTION

## Objective

Get real funding-news data into the system.

## Initial implementation priority

Start with the easiest reliable feeds.

Preferred:

```text
ET Entrepreneur Funding
Inc42 Buzz
```

After these work, add:

```text
Entrackr
YourStory
```

only where technically reliable.

## Tasks

Implement:

```text
FundingSourceAdapter
polling
article normalization
canonical URLs
timestamps
first_seen_at
idempotent inserts
source logging
```

## Exit criteria

```text
at least one live source successfully ingests
preferably two sources
re-running ingestion does not duplicate same articles
source timestamps stored
first_seen timestamps stored
source failures logged
```

## Next phase

PHASE 4 — Funding Classification

---

# PHASE 4 — GEMINI FUNDING CLASSIFICATION

## Objective

Convert raw candidate articles into structured funding events.

## Tasks

Integrate Gemini Flash.

Create:

```text
classification prompt
structured response schema
validation
retry/error handling
```

Extract:

```text
is funding announcement
startup name
India relevance
funding stage
amount
currency
investors
confidence
```

## Exit criteria

Using real or representative articles:

```text
funding articles correctly identified
non-funding articles rejected
structured response validates
model failures are logged
model used is Gemini Flash
```

## Next phase

PHASE 5 — Eligibility + Deduplication

---

# PHASE 5 — ELIGIBILITY AND DEDUPLICATION

## Objective

Turn noisy event data into canonical eligible opportunities.

## Implement

```text
India filter
stage filter
24-hour filter
startup identity resolution
funding-event resolution
previous-contact lookup
article deduplication
```

## Exit criteria

Test demonstrates:

```text
two sources reporting same raise
→ one funding event

old announcement
→ rejected

Series B
→ rejected

non-India
→ rejected

already-contacted startup
→ rejected
```

## Next phase

PHASE 6 — Research & Enrichment

---

# PHASE 6 — RESEARCH & ENRICHMENT

## Objective

Collect enough reliable information for fit assessment and personalization.

## Tasks

Research eligible startup.

Resolve:

```text
website
description
product
sector
subsector
business model
founders
founder background
target customer
technology
traction
market
differentiation
```

Store sources.

Unknown fields must remain unknown.

## Exit criteria

At least one sample candidate has:

```text
structured research profile
research source URLs
confidence/unknown handling
no fabricated facts
```

## Next phase

PHASE 7 — Thesis Configuration & Scoring

---

# PHASE 7 — THESIS & FIT SCORING

## Objective

Determine whether each startup matches the accelerator.

## Tasks

Load active thesis from Supabase at runtime.

Load its current scoring criteria.

Run Gemini assessment.

Validate individual scores.

Calculate total in application code.

Store immutable assessment with thesis version.

## Critical test

Change a thesis setting in Supabase.

Run another assessment.

Confirm:

```text
new assessment uses new thesis
old assessment remains unchanged
```

## Exit criteria

```text
current thesis read dynamically
score breakdown stored
total calculated correctly
qualification threshold applied
thesis updates require no code changes
```

## Next phase

PHASE 8 — Outreach Generation

---

# PHASE 8 — OUTREACH GENERATION

## Objective

Produce meaningful personalized draft outreach for qualified startups.

## Tasks

Generate:

```text
subject
body
```

using Gemini Flash.

Ground copy in verified research.

Store draft.

Implement `DraftProvider`.

If Gmail is authenticated, create an actual Gmail draft.

If not, preserve complete internal draft functionality.

## Exit criteria

Qualified startup has:

```text
personalized draft
stored draft state
no automatic send
no fabricated personalization
```

## Next phase

PHASE 9 — Product UI

---

# PHASE 9 — PRODUCT UI

## Objective

Make the pipeline understandable and usable by Rohit.

## Build

```text
Dashboard
Funding Feed
Qualified Startups
Startup Detail
Drafts
Thesis Settings
Sources / Health
```

## Highest priority UI

The Thesis Settings page is critical because it demonstrates the configurable-fit requirement.

## Exit criteria

Rohit can:

```text
see discovered opportunities
understand qualification
open research
review drafts
edit thesis
save thesis
see future assessments use new thesis
```

## Next phase

PHASE 10 — Scheduling

---

# PHASE 10 — AUTOMATION & SCHEDULING

## Objective

Remove the need for Rohit to manually trigger discovery.

## Build

```text
manual pipeline trigger
scheduled production trigger
secure cron endpoint
pipeline run logging
```

Target cadence:

```text
every 1–3 hours
```

## Exit criteria

Pipeline can execute without browser interaction.

## Next phase

PHASE 11 — End-to-End Validation

---

# PHASE 11 — END-TO-END VALIDATION

## Objective

Prove the whole application works as one product.

Run:

```text
source discovery
→ classification
→ hard filters
→ dedupe
→ research
→ thesis
→ scoring
→ qualification
→ outreach
→ draft
```

Use live data where available.

Do not hide failures.

## Exit criteria

At least one complete trace is documented.

If today's live events contain no qualified company, use:

```text
live ingestion demonstration
+
clearly labelled historical integration fixture
```

## Next phase

PHASE 12 — Documentation

---

# PHASE 12 — DOCUMENTATION

## Required files

`README.md`

`PRD.md`

`PROJECT_STATUS.md`

`docs/components-map.md`

`.env.example`

## README should explain

```text
problem
solution
architecture
sources
AI pipeline
database
setup
environment variables
running locally
running pipeline
thesis settings
deduplication
deployment
limitations
```

## Components Map

Must include architecture diagram.

Use Mermaid where useful.

## Exit criteria

Another developer can understand and run the project without reading Claude's conversation history.

## Next phase

PHASE 13 — Production Quality

---

# PHASE 13 — PRODUCTION QUALITY CHECK

Run:

```text
lint
typecheck
tests
production build
secret scan / manual secret review
```

Fix errors rather than ignoring them.

Review:

```text
security
error handling
loading states
empty states
failed pipeline behavior
database constraints
```

## Exit criteria

All critical checks pass.

## Next phase

PHASE 14 — GitHub

---

# PHASE 14 — GITHUB REPOSITORY

## Objective

Create and publish the V1 source repository.

Recommended repository:

`timed-funding-outreach-engine`

Use authenticated GitHub tooling.

Before push:

```text
verify .gitignore
verify no secrets
verify README
verify Components Map
verify build
```

Create meaningful commit.

Example:

`feat: build V1 timed funding outreach engine`

Push main branch.

Verify remote state.

## Exit criteria

```text
repository exists
remote configured
latest V1 commit present
main pushed successfully
URL recorded
```

## Next phase

PHASE 15 — Vercel Deployment

---

# PHASE 15 — VERCEL DEPLOYMENT

## Objective

Deliver the final working public application.

Configure required environment variables.

Apply production Supabase configuration.

Configure scheduled jobs.

Deploy.

Verify production application.

Test at minimum:

```text
homepage/dashboard loads
Supabase connection works
thesis loads
production build functions
pipeline endpoint works
```

## Exit criteria

Working public URL exists.

## Next phase

PHASE 16 — FINAL ACCEPTANCE

---

# PHASE 16 — FINAL ACCEPTANCE

The project is finished only after Claude verifies:

```text
Live external data works.

Gemini Flash handles runtime AI.

Supabase stores data.

Supabase stores editable thesis.

Changing thesis affects future scoring.

Duplicate outreach is blocked.

Funding event dedupe works.

Qualified companies receive personalized drafts.

Unqualified companies do not clutter Rohit's workflow.

Application is deployed.

GitHub is pushed.

Components Map exists.

README exists.

No secrets are committed.

Final public URL works.
```

---

# 40. PROJECT STATUS FILE

Claude must maintain:

`PROJECT_STATUS.md`

Update it at the end of every meaningful phase.

Recommended format:

```text
# Project Status

## Current Phase

Phase 6 — Research & Enrichment

## Completed

[x] Phase 0 — Environment
[x] Phase 1 — Foundation
[x] Phase 2 — Database
[x] Phase 3 — Source ingestion
[x] Phase 4 — Funding classification
[x] Phase 5 — Eligibility + dedupe

## In Progress

[ ] Phase 6 — Research

## Remaining

[ ] Phase 7 — Thesis scoring
[ ] Phase 8 — Outreach
[ ] Phase 9 — UI
...

## Current Blockers

None

## Last Verified State

- npm test: PASS
- npm run typecheck: PASS
- npm run build: PASS
- Supabase connection: PASS
- Live source ingestion: PASS

## Important Decisions

- India-only V1
- Seed/pre-seed
- 24h eligibility
- Strict no-repeat outreach

## Next Action

Implement structured startup enrichment for candidates that survive hard filters.
```

This file exists specifically so Claude can resume work in later sessions without guessing where development stopped.

---

# 41. CLAUDE SESSION START PROCEDURE

At the beginning of every new Claude Code session:

1. Read `PRD.md`.
2. Read `PROJECT_STATUS.md`.
3. Inspect Git status.
4. Inspect current project files relevant to the active phase.
5. Do not redo completed phases unless validation shows they are broken.
6. Identify the current phase.
7. Continue from the `Next Action` in `PROJECT_STATUS.md`.
8. Preserve the end-to-end product objective.

---

# 42. CLAUDE PHASE COMPLETION PROCEDURE

After completing any phase:

1. Test the work.
2. Verify exit criteria.
3. Fix failures.
4. Update `PROJECT_STATUS.md`.
5. Record important architecture decisions.
6. Mark phase complete only after verification.
7. Start the next phase automatically unless authentication or a destructive ambiguity blocks progress.

Claude should not finish a session with:

> Phase complete.

It should know:

> Phase complete; Phase N+1 is now the next objective.

---

# 43. DECISION-MAKING HIERARCHY

If Claude encounters ambiguity, use this priority:

```text
1. Explicit original assignment requirements
2. This PRD
3. Existing architecture decisions in repository
4. Simplest reliable implementation
5. Future extensibility
```

Do not sacrifice a required V1 outcome merely to make the architecture more elegant.

---

# 44. PRODUCT PRIORITY HIERARCHY

When deciding what to work on:

```text
1. End-to-end correctness
2. Required assignment functionality
3. Reliable live data
4. Data integrity
5. Configurability
6. Duplicate prevention
7. Accuracy / grounding
8. Observability
9. User experience
10. Visual polish
11. Optional features
```

A working ugly pipeline is temporarily preferable to a beautiful dashboard attached to fake data.

A finished pipeline with two reliable sources is preferable to ten fragile scrapers.

---

# 45. IMPORTANT PRODUCT DISTINCTIONS

Claude must preserve the difference between:

## Article

A piece of media coverage.

## Funding event

The actual financing event.

## Startup

The company.

## Assessment

The accelerator's evaluation of the company under one thesis version.

## Outreach

The communication prepared for that startup.

Example:

```text
Startup:
Nimbus AI

Funding Event:
$2.5M Seed

Articles:
ET Entrepreneur
Inc42
YourStory

Assessment:
Thesis v3
Score 84

Outreach:
1 generated draft
```

Do not collapse these concepts into one database object.

---

# 46. EXAMPLE FULL PIPELINE

A source publishes:

```text
Nimbus AI raises $2.5M seed round led by Example Ventures.
```

System discovers it at 10:02.

Gemini identifies:

```text
funding = true
company = Nimbus AI
country = India
stage = seed
amount = $2.5M
```

Hard filters:

```text
India: pass
Seed: pass
Age: pass
Previously contacted: no
```

Another source reports Nimbus AI later.

System links both articles to the same funding event.

Research finds:

```text
Vertical AI company
B2B procurement automation
Two founders with industrial software experience
Early enterprise pilots
```

System loads:

```text
Thesis v4
```

Gemini returns criterion scores.

Application calculates:

```text
Total = 87
```

Threshold is:

```text
70
```

Company qualifies.

Gemini generates personalized outreach.

Draft appears in Rohit's product/email drafts.

Database now contains:

```text
startup
funding event
two source reports
research profile
assessment
thesis version
score
draft
pipeline audit trail
```

Rohit reviews and sends.

This is the intended end-to-end product.

---

# 47. DEFINITION OF DONE

The project is not done when:

```text
UI exists
database exists
Gemini works
one article can be summarized
```

The project is done when:

```text
real funding news
        ↓
becomes structured startup data
        ↓
passes/fails eligibility
        ↓
is deduplicated
        ↓
is researched
        ↓
is evaluated against editable Supabase thesis
        ↓
qualifying startup receives personalized draft
        ↓
Rohit can review it
```

and the system is:

```text
tested
documented
pushed to GitHub
deployed to Vercel
```

---

# 48. FINAL INSTRUCTION TO CLAUDE CODE

Treat this PRD as the permanent product context.

Do not optimize for completing the current prompt alone.

Optimize for completing the full product.

Whenever a phase is complete:

- verify it;
- update `PROJECT_STATUS.md`;
- identify the next unfinished phase;
- continue toward the final end-to-end acceptance criteria.

Do not silently change fundamental product assumptions.

Do not replace live production behavior with mock data merely because mocks are easier.

Do not use Claude as the runtime AI model.

Use Gemini Flash for every runtime AI feature.

Do not create duplicate outreach.

Do not hardcode the accelerator thesis.

Do not automatically send outreach.

Do not claim an integration works unless it has been verified.

The final objective is:

> A deployed system that automatically discovers newly funded Indian pre-seed/seed startups, determines whether they fit a configurable accelerator thesis, researches qualified companies and prepares personalized outreach drafts quickly enough for Rohit to act while the funding announcement is still fresh.
