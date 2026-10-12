-- Additional live source: ET Startups (ETtech) RSS. Verified fresh (items within hours) and
-- funding-heavy (~37 of 50 headlines funding-related) on 2026-10-12.
insert into public.sources (key, name, type, base_url, feed_url, poll_interval_minutes) values
  ('et_startups', 'ET Startups (ETtech)', 'rss', 'https://economictimes.indiatimes.com', 'https://economictimes.indiatimes.com/tech/startups/rssfeeds/78570550.cms', 120)
on conflict (key) do nothing;
