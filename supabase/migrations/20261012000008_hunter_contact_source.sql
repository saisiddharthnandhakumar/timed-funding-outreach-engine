-- Allow Hunter (Email Finder) as a contact discovery source.
alter table public.startup_contacts drop constraint if exists startup_contacts_discovery_source_check;
alter table public.startup_contacts
  add constraint startup_contacts_discovery_source_check
  check (discovery_source in ('company_website','github','web_search','pattern','manual','hunter'));
