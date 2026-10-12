-- Founder-first contact enrichment: discovered contacts, status tracking on startups,
-- and a monthly free-quota budget for optional providers.

-- ───────────────────────────── startups: enrichment state ─────────────────────────────
alter table public.startups
  add column contact_status     text not null default 'pending'
    check (contact_status in ('pending','in_progress','completed','not_found','failed')),
  add column contact_checked_at timestamptz,
  add column contact_error      text;

-- ───────────────────────────── startup_contacts ─────────────────────────────
-- One row per distinct contact (an email address, or a public contact-form URL).
-- Published addresses and guessed candidates live side by side but are distinguished by
-- verification_status; only publicly_confirmed / provider_verified rows are ever used for outreach.
create table public.startup_contacts (
  id                  uuid primary key default gen_random_uuid(),
  startup_id          uuid not null references public.startups(id) on delete cascade,
  founder_id          uuid references public.founders(id) on delete set null,
  founder_name        text,                       -- denormalised so a contact survives founder re-extraction
  kind                text not null check (kind in ('founder','company','contact_form')),
  email               text,                       -- stored lowercased; null for contact_form
  contact_url         text,                       -- the form / page URL for contact_form
  mailbox_role        text,                       -- company mailboxes: general | partnerships | press | support | other
  verification_status text not null
    check (verification_status in ('publicly_confirmed','provider_verified','domain_valid_only','pattern_guessed','unverified')),
  discovery_source    text not null
    check (discovery_source in ('company_website','github','web_search','pattern','manual')),
  source_url          text,
  evidence            text,
  mx_valid            boolean,                    -- true/false = DNS answer, null = lookup inconclusive. NOT proof a mailbox exists.
  confidence          smallint check (confidence between 0 and 100),  -- heuristic ranking aid, NOT a deliverability probability
  is_preferred        boolean not null default false,
  first_found_at      timestamptz not null default now(),
  last_checked_at     timestamptz not null default now(),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint startup_contacts_shape check (
    (kind = 'contact_form' and contact_url is not null and email is null)
    or (kind <> 'contact_form' and email is not null)
  ),
  constraint startup_contacts_email_lower check (email is null or email = lower(email))
);
-- Plain (non-partial) unique indexes so writes can be idempotent upserts; NULLs are distinct in Postgres.
create unique index startup_contacts_email_uidx on public.startup_contacts (startup_id, email);
create unique index startup_contacts_form_uidx  on public.startup_contacts (startup_id, contact_url);
-- At most one preferred outreach contact per startup.
create unique index startup_contacts_one_preferred_uidx on public.startup_contacts (startup_id) where is_preferred;
create index startup_contacts_startup_idx on public.startup_contacts (startup_id, kind);

create trigger startup_contacts_set_updated_at before update on public.startup_contacts
  for each row execute function public.set_updated_at();
alter table public.startup_contacts enable row level security;  -- server-only (service role)

-- ───────────────────────────── monthly free-quota budget ─────────────────────────────
create table public.enrichment_budget (
  provider text not null,
  period   text not null,           -- 'YYYY-MM'
  used     integer not null default 0,
  primary key (provider, period)
);
alter table public.enrichment_budget enable row level security;

-- Atomically spends p_amount units from a provider's monthly budget. Returns false (and spends nothing)
-- when that would exceed p_limit.
create or replace function public.consume_enrichment_budget(p_provider text, p_period text, p_limit integer, p_amount integer default 1)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_used integer;
begin
  insert into public.enrichment_budget as b (provider, period, used)
  values (p_provider, p_period, p_amount)
  on conflict (provider, period) do update
    set used = b.used + p_amount
    where b.used + p_amount <= p_limit
  returning b.used into v_used;
  -- first insert may itself exceed the limit (p_amount > p_limit): undo it
  if v_used is not null and v_used > p_limit then
    update public.enrichment_budget set used = used - p_amount where provider = p_provider and period = p_period;
    return false;
  end if;
  return v_used is not null;
end;
$$;

-- Atomically marks exactly one contact as the preferred outreach contact (or none when p_contact is null).
create or replace function public.set_preferred_contact(p_startup uuid, p_contact uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  update public.startup_contacts set is_preferred = false where startup_id = p_startup and is_preferred;
  if p_contact is not null then
    update public.startup_contacts set is_preferred = true where id = p_contact and startup_id = p_startup;
  end if;
end;
$$;

revoke all on function public.consume_enrichment_budget(text, text, integer, integer) from public, anon, authenticated;
revoke all on function public.set_preferred_contact(uuid, uuid) from public, anon, authenticated;
grant execute on function public.consume_enrichment_budget(text, text, integer, integer) to service_role;
grant execute on function public.set_preferred_contact(uuid, uuid) to service_role;
