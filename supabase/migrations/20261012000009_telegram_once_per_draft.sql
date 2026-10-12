-- Telegram alerts claim a pipeline_events row before sending; this index makes the claim atomic,
-- so a draft gets at most one "found" and one "deadline" alert even if two workers race.
create unique index if not exists pipeline_events_telegram_once_uidx
  on public.pipeline_events (entity_id, event_type)
  where event_type in ('telegram_found', 'telegram_deadline');
