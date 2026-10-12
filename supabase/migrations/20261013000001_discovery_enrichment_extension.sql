-- Discovery / enrichment extension. ADDITIVE ONLY: new nullable-or-defaulted columns and new tables.
-- Nothing existing is dropped, renamed, retyped or rewritten; existing rows keep working unchanged.

-- 1. Source catalogue metadata. `type` (rss/sitemap/scrape/...) still says HOW a source is read;
--    `source_type` says WHAT it is, `source_role` says what it is used for.
alter table public.sources
  add column if not exists source_type    text   default 'news',
  add column if not exists source_role    text[] default array['discovery']::text[],
  add column if not exists adapter_status text   default 'unverified',
  add column if not exists status_note    text,
  add column if not exists config_json    jsonb;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'sources_source_type_check') then
    alter table public.sources add constraint sources_source_type_check
      check (source_type is null or source_type in ('news','investor','company','database','search'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'sources_adapter_status_check') then
    alter table public.sources add constraint sources_adapter_status_check
      check (adapter_status is null or adapter_status in ('verified','unverified','unsupported'));
  end if;
end $$;

-- The five sources already polling live are verified by definition.
update public.sources set adapter_status = 'verified'
  where key in ('et_entrepreneur','inc42_buzz','entrackr','yourstory','et_startups') and adapter_status = 'unverified';

-- 2. Field-level provenance. One row per (startup, field, source); conflicts are flagged, never silently resolved.
create table if not exists public.research_evidence (
  id               uuid primary key default gen_random_uuid(),
  startup_id       uuid not null references public.startups(id) on delete cascade,
  funding_round_id uuid references public.funding_rounds(id) on delete set null,
  field_key        text not null,
  value_json       jsonb not null,
  source_id        uuid references public.sources(id) on delete set null,
  source_url       text,
  evidence_type    text not null check (evidence_type in ('company_first_party','investor_first_party','reputable_media','database','search_result')),
  confidence       text not null default 'medium' check (confidence in ('high','medium','low')),
  -- set when another source disagrees about this field: {"other": <value>, "other_source": "..."}
  conflict_json    jsonb,
  dedupe_key       text not null,
  observed_at      timestamptz not null default now(),
  created_at       timestamptz not null default now()
);
create unique index if not exists research_evidence_dedupe_uidx on public.research_evidence (dedupe_key);
create index if not exists research_evidence_startup_idx on public.research_evidence (startup_id, field_key);
alter table public.research_evidence enable row level security;

-- 3. Cache of investor portfolio pages (changes slowly; refreshed by TTL, never re-crawled each run).
create table if not exists public.investor_portfolio_entries (
  id             uuid primary key default gen_random_uuid(),
  source_id      uuid not null references public.sources(id) on delete cascade,
  page_url       text not null,
  company_name   text not null,
  normalized_name text not null,
  website        text,
  domain         text,
  sector         text,
  stage          text,
  partnered_year integer,
  location       text,
  description    text,
  founders       jsonb not null default '[]'::jsonb,   -- [{"name": "...", "role": null}]
  co_investors   jsonb not null default '[]'::jsonb,
  rationale      jsonb not null default '[]'::jsonb,   -- short "why we invested" points, never article text
  status         text,
  fetched_at     timestamptz not null default now(),
  created_at     timestamptz not null default now(),
  unique (source_id, page_url)
);
create index if not exists investor_portfolio_name_idx on public.investor_portfolio_entries (normalized_name);
create index if not exists investor_portfolio_domain_idx on public.investor_portfolio_entries (domain) where domain is not null;
alter table public.investor_portfolio_entries enable row level security;

-- 4. Investor relationship metadata on the existing round↔investor link.
alter table public.funding_round_investors
  add column if not exists confirmed_by_investor_site boolean default false,
  add column if not exists evidence_url text;
