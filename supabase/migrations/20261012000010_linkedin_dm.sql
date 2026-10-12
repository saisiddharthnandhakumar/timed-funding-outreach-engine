-- LinkedIn cold-DM fallback for drafts that have no reliable email recipient. Drafted here, sent by hand on LinkedIn.
alter table public.outreach
  add column if not exists linkedin_url       text,
  add column if not exists linkedin_recipient text,
  add column if not exists linkedin_role      text,
  add column if not exists linkedin_message   text;
