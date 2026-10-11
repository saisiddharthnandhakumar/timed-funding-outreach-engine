-- Timed Funding Outreach Engine — initial schema (V1)
-- All tables are server-only: RLS is enabled with NO policies, so the anon key
-- can read/write nothing. The app talks to Postgres via the service-role key
-- from server-side code only.

create or replace function public.set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- ───────────────────────────── sources ─────────────────────────────
create table public.sources (
  id                    uuid primary key default gen_random_uuid(),
  key                   text not null unique,            -- stable adapter key, e.g. 'et_entrepreneur'
  name                  text not null,
  type                  text not null check (type in ('rss','sitemap','api','scrape','fixture')),
  base_url              text not null,
  feed_url              text,
  enabled               boolean not null default true,
  poll_interval_minutes integer not null default 120 check (poll_interval_minutes > 0),
  last_polled_at        timestamptz,
  last_success_at       timestamptz,
  last_items_found      integer not null default 0,
  last_error            text,
  last_error_at         timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

-- ───────────────────────────── startups ─────────────────────────────
create table public.startups (
  id                uuid primary key default gen_random_uuid(),
  name              text not null,
  normalized_name   text not null,
  website           text,
  domain            text,
  linkedin_url      text,
  description       text,
  sector            text,
  subsector         text,
  business_model    text,
  hq_city           text,
  hq_country        text,
  founded_year      integer,
  enrichment_status text not null default 'pending'
                    check (enrichment_status in ('pending','in_progress','completed','failed','skipped')),
  enriched_at       timestamptz,
  profile_json      jsonb,        -- full validated research profile (Gemini Task 2)
  research_sources  jsonb not null default '[]'::jsonb,  -- [{url, kind, title, fetched_at}]
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
-- Domain is the strongest identity signal; normalized name is the fallback.
create unique index startups_domain_uidx on public.startups (domain) where domain is not null;
create unique index startups_normalized_name_uidx on public.startups (normalized_name);

create table public.founders (
  id                 uuid primary key default gen_random_uuid(),
  startup_id         uuid not null references public.startups(id) on delete cascade,
  name               text not null,
  role               text,
  linkedin_url       text,
  background_summary text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create unique index founders_startup_name_uidx on public.founders (startup_id, name);

-- ───────────────────────────── funding rounds ─────────────────────────────
create table public.funding_rounds (
  id                           uuid primary key default gen_random_uuid(),
  startup_id                   uuid not null references public.startups(id) on delete cascade,
  stage                        text not null,
  amount                       numeric,
  currency                     text,
  announcement_date            date not null,
  earliest_source_published_at timestamptz,
  status                       text not null default 'discovered'
                               check (status in ('discovered','rejected','enriching','scored','qualified','drafted','error')),
  rejection_reason             text,
  attempts                     integer not null default 0,
  last_error                   text,
  created_at                   timestamptz not null default now(),
  updated_at                   timestamptz not null default now()
);
create unique index funding_rounds_event_uidx on public.funding_rounds (startup_id, stage, announcement_date);
create index funding_rounds_status_idx on public.funding_rounds (status);

-- ───────────────────────────── articles ─────────────────────────────
create table public.funding_articles (
  id                        uuid primary key default gen_random_uuid(),
  source_id                 uuid not null references public.sources(id) on delete cascade,
  source_url                text not null,
  canonical_url             text not null,
  headline                  text not null,
  snippet                   text,
  raw_text                  text,
  source_published_at       timestamptz,
  first_seen_at             timestamptz not null default now(),
  processed_at              timestamptz,
  processing_status         text not null default 'pending'
                            check (processing_status in ('pending','processed','rejected','duplicate','error')),
  rejection_reason          text,
  classification_confidence numeric,
  classification_json       jsonb,
  funding_round_id          uuid references public.funding_rounds(id) on delete set null,
  attempts                  integer not null default 0,
  last_error                text,
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now()
);
create unique index funding_articles_canonical_uidx on public.funding_articles (canonical_url);
create index funding_articles_status_idx on public.funding_articles (processing_status, source_published_at desc);
create index funding_articles_source_idx on public.funding_articles (source_id, first_seen_at desc);

create table public.funding_round_sources (
  id                  uuid primary key default gen_random_uuid(),
  funding_round_id    uuid not null references public.funding_rounds(id) on delete cascade,
  funding_article_id  uuid not null references public.funding_articles(id) on delete cascade,
  source_id           uuid not null references public.sources(id) on delete cascade,
  source_published_at timestamptz,
  first_seen_at       timestamptz not null,
  created_at          timestamptz not null default now(),
  unique (funding_round_id, funding_article_id)
);
create unique index funding_round_sources_article_uidx on public.funding_round_sources (funding_article_id);
create index funding_round_sources_round_idx on public.funding_round_sources (funding_round_id);

create table public.investors (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  website    text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index investors_name_uidx on public.investors (lower(name));

create table public.funding_round_investors (
  funding_round_id uuid not null references public.funding_rounds(id) on delete cascade,
  investor_id      uuid not null references public.investors(id) on delete cascade,
  is_lead          boolean not null default false,
  primary key (funding_round_id, investor_id)
);

-- ───────────────────────────── thesis & scoring config ─────────────────────────────
-- Every save creates a NEW row (new version); old versions stay for audit.
create table public.accelerator_theses (
  id                        uuid primary key default gen_random_uuid(),
  name                      text not null,
  description               text,
  natural_language_thesis   text not null,
  active                    boolean not null default false,
  version                   integer not null unique,
  allowed_countries         text[] not null default '{}',
  allowed_stages            text[] not null default '{}',
  included_sectors          text[] not null default '{}',
  preferred_subsectors      text[] not null default '{}',
  excluded_sectors          text[] not null default '{}',
  preferred_business_models text[] not null default '{}',
  max_announcement_age_hours integer not null default 24 check (max_announcement_age_hours > 0),
  minimum_fit_score         integer not null default 70 check (minimum_fit_score between 0 and 100),
  -- deterministic scoring config (computed in code, not by the model)
  recency_bands             jsonb not null default '[]'::jsonb,   -- [{"max_hours":6,"points":5}, ...]
  stage_points              jsonb not null default '{}'::jsonb,   -- {"seed":15,"pre-seed":15}
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now()
);
-- At most one active thesis.
create unique index accelerator_theses_one_active_uidx on public.accelerator_theses (active) where active;

create table public.scoring_criteria (
  id            uuid primary key default gen_random_uuid(),
  thesis_id     uuid not null references public.accelerator_theses(id) on delete cascade,
  criterion_key text not null,
  display_name  text not null,
  description   text not null default '',
  weight        integer not null check (weight >= 0 and weight <= 100),
  enabled       boolean not null default true,
  sort_order    integer not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (thesis_id, criterion_key)
);

-- ───────────────────────────── assessments & outreach ─────────────────────────────
create table public.fit_assessments (
  id                    uuid primary key default gen_random_uuid(),
  startup_id            uuid not null references public.startups(id) on delete cascade,
  funding_round_id      uuid not null references public.funding_rounds(id) on delete cascade,
  thesis_id             uuid not null references public.accelerator_theses(id),
  thesis_version        integer not null,
  total_score           integer not null check (total_score between 0 and 100),
  qualified             boolean not null,
  criterion_scores_json jsonb not null,
  positive_signals      text[] not null default '{}',
  concerns              text[] not null default '{}',
  reasoning             text,
  confidence            numeric,
  scoring_snapshot      jsonb not null,   -- criteria, weights, threshold used (immutable audit copy)
  raw_model_output      jsonb,
  model_name            text not null,
  assessed_at           timestamptz not null default now(),
  created_at            timestamptz not null default now(),
  unique (funding_round_id, thesis_id)
);
create index fit_assessments_startup_idx on public.fit_assessments (startup_id);

create table public.outreach (
  id                 uuid primary key default gen_random_uuid(),
  startup_id         uuid not null references public.startups(id) on delete cascade,
  funding_round_id   uuid not null references public.funding_rounds(id) on delete cascade,
  fit_assessment_id  uuid references public.fit_assessments(id) on delete set null,
  recipient_name     text,
  recipient_email    text,
  subject            text not null,
  body               text not null,
  draft_provider     text not null default 'database',
  external_draft_id  text,
  status             text not null default 'generated'
                     check (status in ('generated','draft_created','approved','sent','rejected','cancelled')),
  model_name         text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  sent_at            timestamptz
);
-- Strict V1 rule enforced by the database: at most ONE live outreach per startup.
create unique index outreach_one_live_per_startup_uidx
  on public.outreach (startup_id)
  where status in ('generated','draft_created','approved','sent');

-- ───────────────────────────── observability ─────────────────────────────
create table public.pipeline_runs (
  id                   uuid primary key default gen_random_uuid(),
  trigger              text not null default 'manual' check (trigger in ('manual','cron','cli','test')),
  started_at           timestamptz not null default now(),
  completed_at         timestamptz,
  status               text not null default 'running' check (status in ('running','completed','partial','failed')),
  sources_polled       integer not null default 0,
  articles_found       integer not null default 0,
  articles_new         integer not null default 0,
  articles_processed   integer not null default 0,
  funding_events_found integer not null default 0,
  qualified_startups   integer not null default 0,
  drafts_generated     integer not null default 0,
  errors_json          jsonb not null default '[]'::jsonb,
  created_at           timestamptz not null default now()
);

create table public.pipeline_events (
  id              uuid primary key default gen_random_uuid(),
  pipeline_run_id uuid references public.pipeline_runs(id) on delete cascade,
  entity_type     text not null,
  entity_id       uuid,
  event_type      text not null,
  message         text,
  metadata_json   jsonb,
  created_at      timestamptz not null default now()
);
create index pipeline_events_run_idx on public.pipeline_events (pipeline_run_id, created_at);
create index pipeline_events_entity_idx on public.pipeline_events (entity_type, entity_id);

-- Cache + audit of every Gemini call (identical input => no second paid call).
create table public.ai_calls (
  id            uuid primary key default gen_random_uuid(),
  task          text not null,
  input_hash    text not null,
  model         text not null,
  output_json   jsonb,
  prompt_tokens integer,
  output_tokens integer,
  latency_ms    integer,
  created_at    timestamptz not null default now(),
  unique (task, input_hash, model)
);

-- ───────────────────────────── triggers + RLS ─────────────────────────────
do $$
declare t text;
begin
  foreach t in array array['sources','startups','founders','funding_rounds','funding_articles',
                           'investors','accelerator_theses','scoring_criteria','outreach']
  loop
    execute format('create trigger %I before update on public.%I for each row execute function public.set_updated_at()',
                   t || '_set_updated_at', t);
  end loop;

  foreach t in array array['sources','startups','founders','funding_rounds','funding_articles','funding_round_sources',
                           'investors','funding_round_investors','accelerator_theses','scoring_criteria',
                           'fit_assessments','outreach','pipeline_runs','pipeline_events','ai_calls']
  loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;
