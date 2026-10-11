-- Atomic, database-level pipeline run lock.
--
-- Why a lease row instead of pg_advisory_lock: the app talks to Postgres over stateless HTTP
-- (PostgREST), so a session-level advisory lock would be tied to a pooled connection that is
-- recycled between calls and could never be reliably released. A single lease row claimed with
-- one atomic INSERT .. ON CONFLICT DO UPDATE statement gives the same mutual exclusion and also
-- expires by itself if a function instance is killed mid-run.

create table public.pipeline_lock (
  name        text primary key,
  owner_id    uuid        not null,
  acquired_at timestamptz not null default now(),
  expires_at  timestamptz not null
);
alter table public.pipeline_lock enable row level security;  -- server-only, like every other table

-- Claims the lock for p_owner (the run id). Returns true when this caller now owns it.
-- A lease that has expired (crashed/killed run) is taken over. Any pipeline_runs row still marked
-- 'running' at that point cannot belong to a live run (we hold the only lock), so it is marked
-- failed with an explanatory error instead of staying "running" forever.
create or replace function public.acquire_pipeline_lock(p_owner uuid, p_ttl_seconds integer default 330)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_owner uuid;
begin
  insert into public.pipeline_lock as l (name, owner_id, acquired_at, expires_at)
  values ('pipeline', p_owner, now(), now() + make_interval(secs => p_ttl_seconds))
  on conflict (name) do update
    set owner_id = excluded.owner_id, acquired_at = excluded.acquired_at, expires_at = excluded.expires_at
    where l.expires_at <= now()
  returning l.owner_id into v_owner;

  if v_owner is distinct from p_owner then
    return false;  -- someone else holds a live lease
  end if;

  update public.pipeline_runs
     set status = 'failed',
         completed_at = now(),
         errors_json = coalesce(errors_json, '[]'::jsonb)
                       || jsonb_build_array(jsonb_build_object(
                            'scope', 'stale_run',
                            'message', 'Run was still marked running when a newer run took the lock; it was interrupted (function timeout or crash).'))
   where status = 'running';
  return true;
end;
$$;

-- Releases the lock, but only if p_owner still owns it (a late release can never free someone else's lease).
create or replace function public.release_pipeline_lock(p_owner uuid)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_deleted integer;
begin
  delete from public.pipeline_lock where name = 'pipeline' and owner_id = p_owner;
  get diagnostics v_deleted = row_count;
  return v_deleted > 0;
end;
$$;

revoke all on function public.acquire_pipeline_lock(uuid, integer) from public, anon, authenticated;
revoke all on function public.release_pipeline_lock(uuid) from public, anon, authenticated;
grant execute on function public.acquire_pipeline_lock(uuid, integer) to service_role;
grant execute on function public.release_pipeline_lock(uuid) to service_role;
