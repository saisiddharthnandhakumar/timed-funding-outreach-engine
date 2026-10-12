-- Source catalogue for the discovery/enrichment extension. Idempotent; never touches the five live news sources.
-- Usable sources start as 'unverified' and are flipped to 'verified' only after a live run has parsed and stored real data.
-- Unsupported ones are recorded (disabled) with the reason, so the catalogue is honest about what is not covered.
insert into public.sources (key, name, type, base_url, feed_url, enabled, poll_interval_minutes, source_type, source_role, adapter_status, status_note, config_json) values
  -- news, secondary
  ('mint_startups', 'Mint — Start-ups', 'scrape', 'https://www.livemint.com', 'https://www.livemint.com/companies/start-ups', true, 240,
     'news', array['discovery','verification'], 'unverified', null, '{"tier":"secondary"}'),
  -- news, not usable
  ('business_standard', 'Business Standard — Start-ups', 'rss', 'https://www.business-standard.com', null, false, 120,
     'news', array['discovery','verification'], 'unsupported',
     'Business Standard blocks automated access (HTTP 403 bot protection) on every feed and page we tried, so it can''t be read without bypassing that protection.', '{"tier":"primary"}'),
  ('financial_express', 'Financial Express — Start-ups', 'sitemap', 'https://www.financialexpress.com', null, false, 120,
     'news', array['discovery'], 'unsupported',
     'Financial Express has switched its RSS feeds off and has no start-up-specific feed. Its news sitemap is general business news with almost no startup funding, which would only fill the filtered list with noise.', '{"tier":"primary"}'),
  ('moneycontrol', 'Moneycontrol — Startup Funding', 'rss', 'https://www.moneycontrol.com', null, false, 120,
     'news', array['discovery','verification'], 'unsupported',
     'Moneycontrol blocks automated access (HTTP 403 bot protection) on its feeds, so it can''t be read without bypassing that protection.', '{"tier":"secondary"}'),
  -- investors, primary
  ('blume_ventures', 'Blume Ventures', 'scrape', 'https://blume.vc', null, true, 1440,
     'investor', array['discovery','enrichment'], 'unverified', null, '{"tier":"primary","window_days":30,"max_pages":4,"ttl_days":14}'),
  ('stellaris_vp', 'Stellaris Venture Partners', 'scrape', 'https://www.stellarisvp.com', null, true, 1440,
     'investor', array['discovery','enrichment','verification'], 'unverified', null, '{"tier":"primary","window_days":45,"max_pages":6,"ttl_days":14}'),
  ('elevation_capital', 'Elevation Capital', 'scrape', 'https://elevationcapital.com', null, true, 1440,
     'investor', array['discovery','enrichment'], 'unverified', null, '{"tier":"primary","window_days":30,"max_pages":6,"ttl_days":14}'),
  ('nexus_vp', 'Nexus Venture Partners', 'scrape', 'https://www.nexusvp.com', null, true, 10080,
     'investor', array['enrichment'], 'unverified', null, '{"tier":"primary","ttl_days":14}'),
  ('peak_xv', 'Peak XV Partners', 'scrape', 'https://www.peakxv.com', null, true, 1440,
     'investor', array['enrichment','verification','discovery'], 'unverified', null, '{"tier":"primary","window_days":45,"max_pages":4,"ttl_days":14}'),
  -- investors, secondary
  ('three_one_four', '3one4 Capital', 'scrape', 'https://www.3one4capital.com', null, true, 1440,
     'investor', array['discovery','enrichment','verification'], 'unverified', null, '{"tier":"secondary","window_days":30,"max_pages":6,"ttl_days":14}'),
  ('india_quotient', 'India Quotient', 'scrape', 'https://www.indiaquotient.in', null, true, 10080,
     'investor', array['enrichment','verification'], 'unverified', null, '{"tier":"secondary","ttl_days":14}'),
  ('antler_india', 'Antler India', 'scrape', 'https://www.antler.co', null, false, 10080,
     'investor', array['enrichment'], 'unsupported',
     'Antler''s company pages are disallowed by its robots.txt and the portfolio is one large paginated list, so a single lookup would need many page fetches. No stable surface that respects its crawl rules.', '{"tier":"secondary"}')
on conflict (key) do nothing;
