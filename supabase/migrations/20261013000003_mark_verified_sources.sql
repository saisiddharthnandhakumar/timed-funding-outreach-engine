-- Marked verified after a live run on 2026-10-12 polled each source with no errors and (for Mint, Blume, 3one4) stored real articles.
-- The notes say honestly where discovery volume is low.
update public.sources set adapter_status = 'verified' where key in
  ('mint_startups','blume_ventures','stellaris_vp','elevation_capital','nexus_vp','peak_xv','three_one_four','india_quotient');
update public.sources set status_note = 'Posts new investments rarely (a few a quarter), so most checks find nothing new. Its portfolio pages are used to fill in details when researching a startup.'
  where key in ('stellaris_vp','elevation_capital','peak_xv','blume_ventures','three_one_four') and status_note is null;
update public.sources set status_note = 'No news surface: used only to fill in details (founders, sector, website) when researching a startup.'
  where key in ('nexus_vp','india_quotient') and status_note is null;
