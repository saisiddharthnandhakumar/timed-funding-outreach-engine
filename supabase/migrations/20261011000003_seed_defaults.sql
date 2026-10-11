-- Default sources + initial accelerator thesis (version 1). Idempotent.
insert into public.sources (key, name, type, base_url, feed_url, poll_interval_minutes) values
  ('et_entrepreneur', 'ET Entrepreneur — Funding', 'rss',     'https://entrepreneur.economictimes.indiatimes.com', 'https://entrepreneur.economictimes.indiatimes.com/rss/funding', 120),
  ('inc42_buzz',      'Inc42 — Buzz',              'rss',     'https://inc42.com',                                  'https://inc42.com/buzz/feed/', 120),
  ('entrackr',        'Entrackr — News sitemap',   'sitemap', 'https://entrackr.com',                               'https://entrackr.com/news-sitemap.xml', 120),
  ('yourstory',       'YourStory',                 'rss',     'https://yourstory.com',                              'https://yourstory.com/feed', 120)
on conflict (key) do nothing;

do $$
begin
  if not exists (select 1 from public.accelerator_theses) then
    perform public.save_thesis_version(jsonb_build_object(
      'name', 'Default accelerator thesis',
      'description', 'Initial V1 thesis: Indian pre-seed/seed AI-native B2B and deeptech.',
      'natural_language_thesis',
        'We identify Indian pre-seed and seed startups building AI-native B2B software or defensible deep technologies. We prioritize vertical AI, enterprise AI, agentic workflows, developer infrastructure, robotics, spacetech, semiconductor technologies and industrial automation. We also consider climate and health technologies where meaningful proprietary technology exists. We prefer companies operating in large commercial markets, showing credible early validation and led by founders with relevant technical or domain expertise. We avoid undifferentiated AI wrappers, purely consumer novelty applications and companies without evidence of technical differentiation.',
      'allowed_countries', jsonb_build_array('India'),
      'allowed_stages', jsonb_build_array('pre-seed','seed'),
      'included_sectors', jsonb_build_array('AI/ML','Deeptech','Enterprise SaaS'),
      'preferred_subsectors', jsonb_build_array('Vertical AI','Enterprise AI','Agentic Workflows','Developer Tools','AI Infrastructure','Robotics','Spacetech','Semiconductors','Industrial Automation','Climate Technology','Technology-heavy Healthtech'),
      'excluded_sectors', jsonb_build_array('undifferentiated AI wrappers','pure consumer novelty apps'),
      'preferred_business_models', jsonb_build_array('B2B','B2B2C'),
      'max_announcement_age_hours', 24,
      'minimum_fit_score', 70,
      'recency_bands', jsonb_build_array(
        jsonb_build_object('max_hours', 6,  'points', 5),
        jsonb_build_object('max_hours', 12, 'points', 4),
        jsonb_build_object('max_hours', 18, 'points', 3),
        jsonb_build_object('max_hours', 24, 'points', 2)),
      'stage_points', jsonb_build_object('pre-seed', 15, 'seed', 15),
      'criteria', jsonb_build_array(
        jsonb_build_object('criterion_key','sector_fit','display_name','Sector / thesis fit','weight',25,'enabled',true,'sort_order',1,
          'description','Strongest: vertical AI, enterprise AI, AI-native B2B SaaS, AI infrastructure/developer tooling, deeptech, robotics, spacetech, semiconductors, industrial automation. Adjacent (partial credit): climate tech, technology-heavy healthtech, fintech infrastructure. Penalise undifferentiated AI wrappers and consumer novelty apps.'),
        jsonb_build_object('criterion_key','technology_defensibility','display_name','Technology defensibility','weight',15,'enabled',true,'sort_order',2,
          'description','Evidence of proprietary technology/IP, unique data advantage, technically difficult product, research advantage, deep workflow integration, network effects, switching costs or domain-specific expertise. Marketing use of the word "AI" is NOT evidence.'),
        jsonb_build_object('criterion_key','stage_fit','display_name','Stage fit','weight',15,'enabled',true,'sort_order',3,
          'description','Computed deterministically from the funding stage using the configured stage points.'),
        jsonb_build_object('criterion_key','geography_fit','display_name','Geography fit','weight',10,'enabled',true,'sort_order',4,
          'description','Full marks if clearly headquartered in or primarily operating from a target country (India). Partial if India-founded but HQ elsewhere with Indian operations.'),
        jsonb_build_object('criterion_key','market_attractiveness','display_name','Market attractiveness','weight',10,'enabled',true,'sort_order',5,
          'description','Size of the commercial opportunity, structural market growth, seriousness of customer pain, willingness to pay, expansion potential.'),
        jsonb_build_object('criterion_key','founder_quality','display_name','Founder / team evidence','weight',10,'enabled',true,'sort_order',6,
          'description','Evidence only: relevant technical or industry expertise, prior startups/exits, leadership, research credentials, complementary cofounders. Do not credit founders without supporting evidence; unknown backgrounds score low, not zero-by-penalty.'),
        jsonb_build_object('criterion_key','traction','display_name','Traction / validation','weight',10,'enabled',true,'sort_order',7,
          'description','Revenue, paying/enterprise customers, pilots, user growth, partnerships, deployments, retention, contracts. Pre-seed companies naturally have less traction than seed — calibrate to stage.'),
        jsonb_build_object('criterion_key','recency','display_name','Recency','weight',5,'enabled',true,'sort_order',8,
          'description','Computed deterministically from announcement age using the configured recency bands.')
      )
    ));
  end if;
end $$;
