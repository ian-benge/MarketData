-- Seed data for local / demo environments.
-- Profiles and memberships are created by the bootstrap admin script after auth.users exist.

-- Fixed firm id for single-tenant deterministic references.
insert into public.firms (id, name, slug, settings)
values (
  'a0000000-0000-4000-8000-000000000001',
  'Research Desk',
  'research-desk',
  jsonb_build_object(
    'timezone', 'America/Chicago',
    'default_edition_grace_minutes', 15
  )
)
on conflict (slug) do update
set name = excluded.name,
    settings = excluded.settings,
    updated_at = timezone('utc', now());

-- ---------------------------------------------------------------------------
-- Instruments
-- ---------------------------------------------------------------------------

insert into public.instruments (symbol, name, asset_class, exchange, currency, market_cap_category, metadata)
values
  -- Major / sector ETFs
  ('SPY', 'SPDR S&P 500 ETF Trust', 'etf', 'ARCA', 'USD', null, '{"group":"equity_index"}'::jsonb),
  ('QQQ', 'Invesco QQQ Trust', 'etf', 'NASDAQ', 'USD', null, '{"group":"equity_index"}'::jsonb),
  ('IWM', 'iShares Russell 2000 ETF', 'etf', 'ARCA', 'USD', null, '{"group":"equity_index"}'::jsonb),
  ('DIA', 'SPDR Dow Jones Industrial Average ETF', 'etf', 'ARCA', 'USD', null, '{"group":"equity_index"}'::jsonb),
  ('XLF', 'Financial Select Sector SPDR Fund', 'etf', 'ARCA', 'USD', null, '{"group":"sector_etf"}'::jsonb),
  ('XLK', 'Technology Select Sector SPDR Fund', 'etf', 'ARCA', 'USD', null, '{"group":"sector_etf"}'::jsonb),
  ('XLE', 'Energy Select Sector SPDR Fund', 'etf', 'ARCA', 'USD', null, '{"group":"sector_etf"}'::jsonb),
  ('XLV', 'Health Care Select Sector SPDR Fund', 'etf', 'ARCA', 'USD', null, '{"group":"sector_etf"}'::jsonb),
  ('XLI', 'Industrial Select Sector SPDR Fund', 'etf', 'ARCA', 'USD', null, '{"group":"sector_etf"}'::jsonb),
  ('XLY', 'Consumer Discretionary Select Sector SPDR Fund', 'etf', 'ARCA', 'USD', null, '{"group":"sector_etf"}'::jsonb),
  ('XLP', 'Consumer Staples Select Sector SPDR Fund', 'etf', 'ARCA', 'USD', null, '{"group":"sector_etf"}'::jsonb),
  ('XLU', 'Utilities Select Sector SPDR Fund', 'etf', 'ARCA', 'USD', null, '{"group":"sector_etf"}'::jsonb),
  ('XLB', 'Materials Select Sector SPDR Fund', 'etf', 'ARCA', 'USD', null, '{"group":"sector_etf"}'::jsonb),
  ('XLRE', 'Real Estate Select Sector SPDR Fund', 'etf', 'ARCA', 'USD', null, '{"group":"sector_etf"}'::jsonb),
  ('XLC', 'Communication Services Select Sector SPDR Fund', 'etf', 'ARCA', 'USD', null, '{"group":"sector_etf"}'::jsonb),
  -- Vol / rates / FX / commodities / crypto ETFs
  ('VIXY', 'ProShares VIX Short-Term Futures ETF', 'etf', 'BATS', 'USD', null, '{"group":"volatility","note":"VIX proxy"}'::jsonb),
  ('TLT', 'iShares 20+ Year Treasury Bond ETF', 'etf', 'NASDAQ', 'USD', null, '{"group":"rates"}'::jsonb),
  ('IEF', 'iShares 7-10 Year Treasury Bond ETF', 'etf', 'NASDAQ', 'USD', null, '{"group":"rates"}'::jsonb),
  ('SHY', 'iShares 1-3 Year Treasury Bond ETF', 'etf', 'NASDAQ', 'USD', null, '{"group":"rates"}'::jsonb),
  ('UUP', 'Invesco DB US Dollar Index Bullish Fund', 'etf', 'ARCA', 'USD', null, '{"group":"fx"}'::jsonb),
  ('FXE', 'Invesco CurrencyShares Euro Trust', 'etf', 'ARCA', 'USD', null, '{"group":"fx"}'::jsonb),
  ('FXY', 'Invesco CurrencyShares Japanese Yen Trust', 'etf', 'ARCA', 'USD', null, '{"group":"fx"}'::jsonb),
  ('USO', 'United States Oil Fund', 'etf', 'ARCA', 'USD', null, '{"group":"commodity"}'::jsonb),
  ('BNO', 'United States Brent Oil Fund', 'etf', 'ARCA', 'USD', null, '{"group":"commodity"}'::jsonb),
  ('UNG', 'United States Natural Gas Fund', 'etf', 'ARCA', 'USD', null, '{"group":"commodity"}'::jsonb),
  ('GLD', 'SPDR Gold Shares', 'etf', 'ARCA', 'USD', null, '{"group":"commodity"}'::jsonb),
  ('SLV', 'iShares Silver Trust', 'etf', 'ARCA', 'USD', null, '{"group":"commodity"}'::jsonb),
  ('CPER', 'United States Copper Index Fund', 'etf', 'ARCA', 'USD', null, '{"group":"commodity"}'::jsonb),
  ('BITO', 'ProShares Bitcoin Strategy ETF', 'etf', 'ARCA', 'USD', null, '{"group":"crypto"}'::jsonb),
  ('ETHA', 'iShares Ethereum Trust ETF', 'etf', 'NASDAQ', 'USD', null, '{"group":"crypto"}'::jsonb),
  -- Mega / large caps + AI stack
  ('NVDA', 'NVIDIA Corporation', 'equity', 'NASDAQ', 'USD', 'mega', '{"group":"mega_cap"}'::jsonb),
  ('MSFT', 'Microsoft Corporation', 'equity', 'NASDAQ', 'USD', 'mega', '{"group":"mega_cap"}'::jsonb),
  ('AAPL', 'Apple Inc.', 'equity', 'NASDAQ', 'USD', 'mega', '{"group":"mega_cap"}'::jsonb),
  ('GOOGL', 'Alphabet Inc. Class A', 'equity', 'NASDAQ', 'USD', 'mega', '{"group":"mega_cap"}'::jsonb),
  ('AMZN', 'Amazon.com Inc.', 'equity', 'NASDAQ', 'USD', 'mega', '{"group":"mega_cap"}'::jsonb),
  ('META', 'Meta Platforms Inc.', 'equity', 'NASDAQ', 'USD', 'mega', '{"group":"mega_cap"}'::jsonb),
  ('AVGO', 'Broadcom Inc.', 'equity', 'NASDAQ', 'USD', 'mega', '{"group":"mega_cap"}'::jsonb),
  ('TSM', 'Taiwan Semiconductor Manufacturing Co.', 'equity', 'NYSE', 'USD', 'mega', '{"group":"mega_cap"}'::jsonb),
  ('AMD', 'Advanced Micro Devices Inc.', 'equity', 'NASDAQ', 'USD', 'large', '{"group":"mega_cap"}'::jsonb),
  ('TSLA', 'Tesla Inc.', 'equity', 'NASDAQ', 'USD', 'mega', '{"group":"mega_cap"}'::jsonb),
  ('ORCL', 'Oracle Corporation', 'equity', 'NYSE', 'USD', 'mega', '{"group":"mega_cap"}'::jsonb),
  ('NFLX', 'Netflix Inc.', 'equity', 'NASDAQ', 'USD', 'large', '{"group":"mega_cap"}'::jsonb),
  ('CRM', 'Salesforce Inc.', 'equity', 'NYSE', 'USD', 'large', '{"group":"mega_cap"}'::jsonb),
  ('ADBE', 'Adobe Inc.', 'equity', 'NASDAQ', 'USD', 'large', '{"group":"mega_cap"}'::jsonb),
  ('INTC', 'Intel Corporation', 'equity', 'NASDAQ', 'USD', 'large', '{"group":"semiconductors"}'::jsonb),
  ('ASML', 'ASML Holding N.V.', 'equity', 'NASDAQ', 'USD', 'large', '{"group":"semiconductors"}'::jsonb),
  ('AMAT', 'Applied Materials Inc.', 'equity', 'NASDAQ', 'USD', 'large', '{"group":"semiconductors"}'::jsonb),
  ('LRCX', 'Lam Research Corporation', 'equity', 'NASDAQ', 'USD', 'large', '{"group":"semiconductors"}'::jsonb),
  ('KLAC', 'KLA Corporation', 'equity', 'NASDAQ', 'USD', 'large', '{"group":"semiconductors"}'::jsonb),
  ('MU', 'Micron Technology Inc.', 'equity', 'NASDAQ', 'USD', 'large', '{"group":"semiconductors"}'::jsonb),
  ('COHR', 'Coherent Corp.', 'equity', 'NYSE', 'USD', 'mid', '{"group":"photonics"}'::jsonb),
  ('LITE', 'Lumentum Holdings Inc.', 'equity', 'NASDAQ', 'USD', 'mid', '{"group":"photonics"}'::jsonb),
  ('AAOI', 'Applied Optoelectronics Inc.', 'equity', 'NASDAQ', 'USD', 'small', '{"group":"photonics"}'::jsonb),
  ('CIEN', 'Ciena Corporation', 'equity', 'NYSE', 'USD', 'mid', '{"group":"photonics"}'::jsonb),
  ('FN', 'Fabrinet', 'equity', 'NYSE', 'USD', 'mid', '{"group":"photonics"}'::jsonb),
  ('DLR', 'Digital Realty Trust Inc.', 'equity', 'NYSE', 'USD', 'large', '{"group":"data_centers"}'::jsonb),
  ('EQIX', 'Equinix Inc.', 'equity', 'NASDAQ', 'USD', 'large', '{"group":"data_centers"}'::jsonb),
  ('AMT', 'American Tower Corporation', 'equity', 'NYSE', 'USD', 'large', '{"group":"data_centers"}'::jsonb),
  ('CCI', 'Crown Castle Inc.', 'equity', 'NYSE', 'USD', 'large', '{"group":"data_centers"}'::jsonb),
  ('IRM', 'Iron Mountain Inc.', 'equity', 'NYSE', 'USD', 'mid', '{"group":"data_centers"}'::jsonb),
  ('CEG', 'Constellation Energy Corporation', 'equity', 'NASDAQ', 'USD', 'large', '{"group":"power"}'::jsonb),
  ('VST', 'Vistra Corp.', 'equity', 'NYSE', 'USD', 'large', '{"group":"power"}'::jsonb),
  ('NEE', 'NextEra Energy Inc.', 'equity', 'NYSE', 'USD', 'mega', '{"group":"power"}'::jsonb),
  ('CTRA', 'Coterra Energy Inc.', 'equity', 'NYSE', 'USD', 'mid', '{"group":"power"}'::jsonb),
  ('LNG', 'Cheniere Energy Inc.', 'equity', 'NYSE', 'USD', 'large', '{"group":"power"}'::jsonb),
  ('SMR', 'NuScale Power Corporation', 'equity', 'NYSE', 'USD', 'small', '{"group":"power"}'::jsonb),
  ('OKLO', 'Oklo Inc.', 'equity', 'NYSE', 'USD', 'small', '{"group":"power"}'::jsonb),
  ('PLTR', 'Palantir Technologies Inc.', 'equity', 'NASDAQ', 'USD', 'large', '{"group":"ai_software"}'::jsonb),
  ('SNOW', 'Snowflake Inc.', 'equity', 'NYSE', 'USD', 'large', '{"group":"ai_software"}'::jsonb),
  ('DDOG', 'Datadog Inc.', 'equity', 'NASDAQ', 'USD', 'large', '{"group":"ai_software"}'::jsonb),
  ('NET', 'Cloudflare Inc.', 'equity', 'NYSE', 'USD', 'large', '{"group":"ai_software"}'::jsonb),
  ('CRWD', 'CrowdStrike Holdings Inc.', 'equity', 'NASDAQ', 'USD', 'large', '{"group":"ai_software"}'::jsonb),
  ('MDB', 'MongoDB Inc.', 'equity', 'NASDAQ', 'USD', 'mid', '{"group":"ai_software"}'::jsonb),
  ('PATH', 'UiPath Inc.', 'equity', 'NYSE', 'USD', 'mid', '{"group":"ai_software"}'::jsonb),
  ('NOW', 'ServiceNow Inc.', 'equity', 'NYSE', 'USD', 'large', '{"group":"ai_software"}'::jsonb)
on conflict (symbol) do update
set name = excluded.name,
    asset_class = excluded.asset_class,
    exchange = excluded.exchange,
    currency = excluded.currency,
    market_cap_category = excluded.market_cap_category,
    metadata = excluded.metadata,
    is_active = true,
    updated_at = timezone('utc', now());

-- ---------------------------------------------------------------------------
-- AI infrastructure sectors
-- ---------------------------------------------------------------------------

with firm as (
  select id from public.firms where slug = 'research-desk'
),
sector_defs as (
  select *
  from (values
    ('semiconductors', 'Semiconductors', 'Chip designers, foundries, and equipment for AI compute.', 10),
    ('photonics', 'Photonics', 'Optical interconnects and laser / transceiver suppliers.', 20),
    ('hyperscalers', 'Hyperscalers', 'Cloud platforms driving AI training and inference spend.', 30),
    ('data-centers', 'Data Centers', 'REITs and infrastructure hosting AI capacity.', 40),
    ('power-grid-nuclear-gas', 'Power Grid / Nuclear / Gas', 'Generation and fuel enabling AI power demand.', 50),
    ('ai-software', 'AI Software', 'Platforms and apps monetizing AI workloads.', 60)
  ) as t(slug, name, description, sort_order)
)
insert into public.sectors (firm_id, slug, name, description, sort_order)
select firm.id, sd.slug, sd.name, sd.description, sd.sort_order
from firm
cross join sector_defs sd
on conflict (firm_id, slug) do update
set name = excluded.name,
    description = excluded.description,
    sort_order = excluded.sort_order,
    updated_at = timezone('utc', now());

-- Sector memberships
with mappings as (
  select *
  from (values
    ('semiconductors', 'NVDA'),
    ('semiconductors', 'AVGO'),
    ('semiconductors', 'AMD'),
    ('semiconductors', 'TSM'),
    ('semiconductors', 'ASML'),
    ('semiconductors', 'AMAT'),
    ('semiconductors', 'LRCX'),
    ('semiconductors', 'KLAC'),
    ('semiconductors', 'MU'),
    ('semiconductors', 'INTC'),
    ('photonics', 'COHR'),
    ('photonics', 'LITE'),
    ('photonics', 'AAOI'),
    ('photonics', 'CIEN'),
    ('photonics', 'FN'),
    ('hyperscalers', 'MSFT'),
    ('hyperscalers', 'GOOGL'),
    ('hyperscalers', 'AMZN'),
    ('hyperscalers', 'META'),
    ('hyperscalers', 'ORCL'),
    ('data-centers', 'DLR'),
    ('data-centers', 'EQIX'),
    ('data-centers', 'AMT'),
    ('data-centers', 'CCI'),
    ('data-centers', 'IRM'),
    ('power-grid-nuclear-gas', 'CEG'),
    ('power-grid-nuclear-gas', 'VST'),
    ('power-grid-nuclear-gas', 'NEE'),
    ('power-grid-nuclear-gas', 'CTRA'),
    ('power-grid-nuclear-gas', 'LNG'),
    ('power-grid-nuclear-gas', 'SMR'),
    ('power-grid-nuclear-gas', 'OKLO'),
    ('ai-software', 'PLTR'),
    ('ai-software', 'SNOW'),
    ('ai-software', 'DDOG'),
    ('ai-software', 'NET'),
    ('ai-software', 'CRWD'),
    ('ai-software', 'MDB'),
    ('ai-software', 'PATH'),
    ('ai-software', 'NOW')
  ) as t(sector_slug, symbol)
)
insert into public.sector_instruments (sector_id, instrument_id, sort_order)
select s.id, i.id, row_number() over (partition by s.slug order by m.symbol)
from mappings m
join public.firms f on f.slug = 'research-desk'
join public.sectors s on s.firm_id = f.id and s.slug = m.sector_slug
join public.instruments i on i.symbol = m.symbol
on conflict (sector_id, instrument_id) do nothing;

-- ---------------------------------------------------------------------------
-- Default Core watchlist
-- ---------------------------------------------------------------------------

insert into public.watchlists (firm_id, name, description, is_default)
select f.id, 'Core', 'Default cross-asset watchlist for daily editions.', true
from public.firms f
where f.slug = 'research-desk'
on conflict (firm_id, name) do update
set description = excluded.description,
    is_default = true,
    updated_at = timezone('utc', now());

with core_symbols as (
  select *
  from (values
    ('SPY', 10),
    ('QQQ', 20),
    ('IWM', 30),
    ('TLT', 40),
    ('UUP', 50),
    ('GLD', 60),
    ('USO', 70),
    ('VIXY', 80),
    ('BITO', 90),
    ('NVDA', 100),
    ('MSFT', 110),
    ('AAPL', 120),
    ('GOOGL', 130),
    ('AMZN', 140),
    ('META', 150),
    ('AVGO', 160),
    ('AMD', 170),
    ('TSM', 180)
  ) as t(symbol, sort_order)
)
insert into public.watchlist_items (watchlist_id, instrument_id, sort_order)
select w.id, i.id, cs.sort_order
from public.firms f
join public.watchlists w on w.firm_id = f.id and w.name = 'Core'
join core_symbols cs on true
join public.instruments i on i.symbol = cs.symbol
where f.slug = 'research-desk'
on conflict (watchlist_id, instrument_id) do update
set sort_order = excluded.sort_order,
    updated_at = timezone('utc', now());

-- ---------------------------------------------------------------------------
-- Default Chicago report config
-- ---------------------------------------------------------------------------

insert into public.report_configs (
  firm_id,
  name,
  timezone,
  editions,
  enabled,
  partial_delivery_allowed,
  quality_gate_settings,
  email_settings
)
select
  f.id,
  'Chicago Editions',
  'America/Chicago',
  jsonb_build_object(
    'premarket', '07:30',
    'midday', '11:30',
    'close_postmarket', '16:00'
  ),
  true,
  true,
  jsonb_build_object(
    'blocking_severities', jsonb_build_array('blocking'),
    'require_citations_for_material_claims', true
  ),
  jsonb_build_object(
    'from_name', 'Research Desk',
    'subject_template', '{{edition}} report — {{trading_date}}'
  )
from public.firms f
where f.slug = 'research-desk'
on conflict (firm_id, name) do update
set timezone = excluded.timezone,
    editions = excluded.editions,
    enabled = excluded.enabled,
    partial_delivery_allowed = excluded.partial_delivery_allowed,
    quality_gate_settings = excluded.quality_gate_settings,
    email_settings = excluded.email_settings,
    updated_at = timezone('utc', now());

-- ---------------------------------------------------------------------------
-- Provider configs (non-secret)
-- ---------------------------------------------------------------------------

with firm as (
  select id from public.firms where slug = 'research-desk'
),
providers as (
  select *
  from (values
    (
      'finnhub',
      'Finnhub',
      'market'::public.source_class,
      true,
      true,
      10,
      60,
      '{"base_url":"https://finnhub.io/api/v1","supports":["quotes","news","earnings"]}'::jsonb
    ),
    (
      'fred',
      'FRED',
      'macro'::public.source_class,
      true,
      true,
      20,
      120,
      '{"base_url":"https://api.stlouisfed.org/fred","default_series":["DGS10","T10Y2Y","VIXCLS"]}'::jsonb
    ),
    (
      'rss',
      'RSS Feeds',
      'rss'::public.source_class,
      true,
      false,
      30,
      30,
      '{"feeds":[]}'::jsonb
    ),
    (
      'mock',
      'Mock Providers',
      'mock'::public.source_class,
      true,
      false,
      999,
      null,
      '{"demo_only":true,"requires_allow_mock_providers":true}'::jsonb
    ),
    (
      'openai',
      'OpenAI',
      'ai'::public.source_class,
      true,
      true,
      40,
      60,
      '{"default_model":"gpt-4.1-mini","structured_outputs":true}'::jsonb
    ),
    (
      'anthropic',
      'Anthropic',
      'ai'::public.source_class,
      true,
      false,
      50,
      60,
      '{"default_model":"claude-sonnet-4-20250514"}'::jsonb
    ),
    (
      'gemini',
      'Google Gemini',
      'ai'::public.source_class,
      true,
      false,
      60,
      60,
      '{"default_model":"gemini-2.0-flash"}'::jsonb
    ),
    (
      'resend',
      'Resend',
      'email'::public.source_class,
      true,
      true,
      70,
      30,
      '{"api_base":"https://api.resend.com"}'::jsonb
    )
  ) as t(
    provider_key,
    display_name,
    source_class,
    enabled,
    is_primary,
    priority,
    rate_limit_per_minute,
    config
  )
)
insert into public.provider_configs (
  firm_id,
  provider_key,
  display_name,
  source_class,
  enabled,
  is_primary,
  priority,
  rate_limit_per_minute,
  config
)
select
  firm.id,
  p.provider_key,
  p.display_name,
  p.source_class,
  p.enabled,
  p.is_primary,
  p.priority,
  p.rate_limit_per_minute,
  p.config
from firm
cross join providers p
on conflict (firm_id, provider_key) do update
set display_name = excluded.display_name,
    source_class = excluded.source_class,
    enabled = excluded.enabled,
    is_primary = excluded.is_primary,
    priority = excluded.priority,
    rate_limit_per_minute = excluded.rate_limit_per_minute,
    config = excluded.config,
    updated_at = timezone('utc', now());
