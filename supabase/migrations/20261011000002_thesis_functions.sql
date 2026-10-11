-- Atomic "save thesis as a new version" used by the settings page.
-- Payload shape:
--   { name, description, natural_language_thesis, allowed_countries[], allowed_stages[],
--     included_sectors[], preferred_subsectors[], excluded_sectors[], preferred_business_models[],
--     max_announcement_age_hours, minimum_fit_score, recency_bands[], stage_points{},
--     criteria: [{criterion_key, display_name, description, weight, enabled, sort_order}] }
-- Old versions are kept untouched (deactivated) so past assessments stay auditable.
create or replace function public.save_thesis_version(p_payload jsonb) returns uuid
language plpgsql as $$
declare
  v_weight_sum integer;
  v_version    integer;
  v_id         uuid;
  c            jsonb;
begin
  select coalesce(sum((x->>'weight')::int), 0) into v_weight_sum
  from jsonb_array_elements(p_payload->'criteria') x
  where coalesce((x->>'enabled')::boolean, true);

  if v_weight_sum <> 100 then
    raise exception 'Enabled scoring weights must total 100 (got %)', v_weight_sum
      using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtext('save_thesis_version'));
  select coalesce(max(version), 0) + 1 into v_version from public.accelerator_theses;

  update public.accelerator_theses set active = false where active;

  insert into public.accelerator_theses (
    name, description, natural_language_thesis, active, version,
    allowed_countries, allowed_stages, included_sectors, preferred_subsectors,
    excluded_sectors, preferred_business_models, max_announcement_age_hours,
    minimum_fit_score, recency_bands, stage_points
  ) values (
    p_payload->>'name', p_payload->>'description', p_payload->>'natural_language_thesis', true, v_version,
    array(select jsonb_array_elements_text(p_payload->'allowed_countries')),
    array(select jsonb_array_elements_text(p_payload->'allowed_stages')),
    array(select jsonb_array_elements_text(p_payload->'included_sectors')),
    array(select jsonb_array_elements_text(p_payload->'preferred_subsectors')),
    array(select jsonb_array_elements_text(p_payload->'excluded_sectors')),
    array(select jsonb_array_elements_text(p_payload->'preferred_business_models')),
    (p_payload->>'max_announcement_age_hours')::int,
    (p_payload->>'minimum_fit_score')::int,
    coalesce(p_payload->'recency_bands', '[]'::jsonb),
    coalesce(p_payload->'stage_points', '{}'::jsonb)
  ) returning id into v_id;

  for c in select * from jsonb_array_elements(p_payload->'criteria') loop
    insert into public.scoring_criteria (thesis_id, criterion_key, display_name, description, weight, enabled, sort_order)
    values (v_id, c->>'criterion_key', c->>'display_name', coalesce(c->>'description',''),
            (c->>'weight')::int, coalesce((c->>'enabled')::boolean, true), coalesce((c->>'sort_order')::int, 0));
  end loop;

  return v_id;
end $$;

revoke all on function public.save_thesis_version(jsonb) from public, anon, authenticated;
