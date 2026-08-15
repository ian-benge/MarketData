-- Coverage taxonomy: collection types, instrument identity, membership
-- context, aliases, and an admin resolution queue. Does not replace the
-- existing instruments master or quote path.

-- ---------------------------------------------------------------------------
-- Instruments
-- ---------------------------------------------------------------------------

alter table public.instruments
  add column if not exists security_type text not null default 'unknown',
  add column if not exists country text,
  add column if not exists issuer text,
  add column if not exists underlying_symbol text,
  add column if not exists leverage_multiple numeric,
  add column if not exists is_inverse boolean not null default false,
  add column if not exists is_otc boolean not null default false,
  add column if not exists listing_date date,
  add column if not exists delisting_date date,
  add column if not exists last_verified_at timestamptz,
  add column if not exists quote_source text,
  add column if not exists resolution_status text not null default 'unverified',
  add column if not exists vendor_symbols jsonb not null default '{}'::jsonb;

alter table public.instruments
  drop constraint if exists instruments_security_type_chk;
alter table public.instruments
  add constraint instruments_security_type_chk
  check (security_type in (
    'common_stock', 'adr', 'etf', 'etn', 'index', 'future', 'otc', 'crypto', 'other', 'unknown'
  ));

alter table public.instruments
  drop constraint if exists instruments_resolution_status_chk;
alter table public.instruments
  add constraint instruments_resolution_status_chk
  check (resolution_status in ('resolved', 'unverified', 'quarantined', 'inactive'));

create index if not exists instruments_resolution_status_idx
  on public.instruments (resolution_status)
  where resolution_status is distinct from 'resolved';

create index if not exists instruments_security_type_idx
  on public.instruments (security_type);

-- ---------------------------------------------------------------------------
-- Aliases
-- ---------------------------------------------------------------------------

create table if not exists public.instrument_aliases (
  id uuid primary key default gen_random_uuid(),
  instrument_id uuid not null references public.instruments (id) on delete cascade,
  alias text not null,
  source text,
  created_at timestamptz not null default timezone('utc', now()),
  unique (alias)
);

create index if not exists instrument_aliases_instrument_idx
  on public.instrument_aliases (instrument_id);

alter table public.instrument_aliases enable row level security;

drop policy if exists instrument_aliases_select_member on public.instrument_aliases;
create policy instrument_aliases_select_member
  on public.instrument_aliases for select to authenticated
  using (public.auth_is_active_member());

drop policy if exists instrument_aliases_admin_write on public.instrument_aliases;
create policy instrument_aliases_admin_write
  on public.instrument_aliases for all to authenticated
  using (public.auth_is_admin())
  with check (public.auth_is_admin());

-- ---------------------------------------------------------------------------
-- Resolution queue
-- ---------------------------------------------------------------------------

create table if not exists public.instrument_resolution_queue (
  id uuid primary key default gen_random_uuid(),
  instrument_id uuid not null references public.instruments (id) on delete cascade,
  symbol text not null,
  status text not null default 'open',
  suggested_symbol text,
  suggested_name text,
  reason text,
  evidence jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  resolved_at timestamptz,
  resolved_by uuid references public.profiles (id) on delete set null,
  unique (instrument_id)
);

alter table public.instrument_resolution_queue
  drop constraint if exists instrument_resolution_queue_status_chk;
alter table public.instrument_resolution_queue
  add constraint instrument_resolution_queue_status_chk
  check (status in ('open', 'suggested', 'dismissed', 'resolved'));

create index if not exists instrument_resolution_queue_status_idx
  on public.instrument_resolution_queue (status, updated_at desc);

alter table public.instrument_resolution_queue enable row level security;

drop policy if exists instrument_resolution_queue_admin on public.instrument_resolution_queue;
create policy instrument_resolution_queue_admin
  on public.instrument_resolution_queue for all to authenticated
  using (public.auth_is_admin())
  with check (public.auth_is_admin());

-- ---------------------------------------------------------------------------
-- Watchlists
-- ---------------------------------------------------------------------------

alter table public.watchlists
  add column if not exists purpose text not null default 'general',
  add column if not exists nav_group text not null default 'tactical';

alter table public.watchlists
  drop constraint if exists watchlists_purpose_chk;
alter table public.watchlists
  add constraint watchlists_purpose_chk
  check (purpose in ('tape', 'leaders', 'tactical', 'research', 'general'));

alter table public.watchlists
  drop constraint if exists watchlists_nav_group_chk;
alter table public.watchlists
  add constraint watchlists_nav_group_chk
  check (nav_group in (
    'market_tape', 'official_sectors', 'ai_compute', 'energy_materials',
    'industrials_defense', 'health_consumer', 'financial_digital', 'tactical'
  ));

-- ---------------------------------------------------------------------------
-- Membership metadata
-- ---------------------------------------------------------------------------

alter table public.watchlist_items
  add column if not exists role text,
  add column if not exists tier text,
  add column if not exists rationale text,
  add column if not exists source_url text,
  add column if not exists confidence text,
  add column if not exists review_by date,
  add column if not exists expires_at date;

alter table public.watchlist_items
  drop constraint if exists watchlist_items_role_chk;
alter table public.watchlist_items
  add constraint watchlist_items_role_chk
  check (role is null or role in (
    'leader', 'pure_play', 'supplier', 'customer', 'proxy', 'benchmark', 'speculative'
  ));

alter table public.watchlist_items
  drop constraint if exists watchlist_items_tier_chk;
alter table public.watchlist_items
  add constraint watchlist_items_tier_chk
  check (tier is null or tier in ('core', 'secondary', 'high_beta'));

alter table public.sector_instruments
  add column if not exists notes text,
  add column if not exists tags text[] not null default '{}'::text[],
  add column if not exists role text,
  add column if not exists tier text,
  add column if not exists rationale text,
  add column if not exists source_url text,
  add column if not exists confidence text,
  add column if not exists review_by date,
  add column if not exists expires_at date;

alter table public.sector_instruments
  drop constraint if exists sector_instruments_role_chk;
alter table public.sector_instruments
  add constraint sector_instruments_role_chk
  check (role is null or role in (
    'leader', 'pure_play', 'supplier', 'customer', 'proxy', 'benchmark', 'speculative'
  ));

alter table public.sector_instruments
  drop constraint if exists sector_instruments_tier_chk;
alter table public.sector_instruments
  add constraint sector_instruments_tier_chk
  check (tier is null or tier in ('core', 'secondary', 'high_beta'));

-- ---------------------------------------------------------------------------
-- Sectors / collections
-- ---------------------------------------------------------------------------

alter table public.sectors
  add column if not exists nav_group text not null default 'tactical',
  add column if not exists benchmark_symbol text,
  add column if not exists last_reviewed_at timestamptz,
  add column if not exists review_by date,
  add column if not exists expires_at date,
  add column if not exists source_url text,
  add column if not exists screen_key text,
  add column if not exists is_system boolean not null default false;

alter table public.sectors
  drop constraint if exists sectors_kind_chk;
alter table public.sectors
  add constraint sectors_kind_chk
  check (kind in (
    'sector', 'industry', 'theme', 'macro', 'catalyst', 'screen',
    'benchmark', 'leveraged_product', 'custom'
  ));

alter table public.sectors
  drop constraint if exists sectors_nav_group_chk;
alter table public.sectors
  add constraint sectors_nav_group_chk
  check (nav_group in (
    'market_tape', 'official_sectors', 'ai_compute', 'energy_materials',
    'industrials_defense', 'health_consumer', 'financial_digital', 'tactical'
  ));

create index if not exists sectors_firm_nav_idx
  on public.sectors (firm_id, nav_group, sort_order, name);

create index if not exists sectors_parent_idx
  on public.sectors (parent_id)
  where parent_id is not null;

-- Catalyst collections must carry a review or expiry once classified.
alter table public.sectors
  drop constraint if exists sectors_catalyst_review_chk;
alter table public.sectors
  add constraint sectors_catalyst_review_chk
  check (
    kind <> 'catalyst'
    or review_by is not null
    or expires_at is not null
  );

-- Members may update instrument identity they just inserted (resolver + name backfill).
drop policy if exists instruments_update_member on public.instruments;
create policy instruments_update_member
  on public.instruments for update to authenticated
  using (public.auth_is_active_member())
  with check (public.auth_is_active_member());
