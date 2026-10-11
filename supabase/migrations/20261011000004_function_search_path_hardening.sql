-- Supabase security advisor: pin search_path on our functions.
alter function public.set_updated_at() set search_path = public, pg_temp;
alter function public.save_thesis_version(jsonb) set search_path = public, pg_temp;
