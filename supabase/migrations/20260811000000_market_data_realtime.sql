-- Realtime market-data core: licensing, latest observations, bars provenance,
-- refresh runs, usage counters, health events, immutable report snapshots.
-- Secrets stay in env — only non-secret license/config rows are stored.

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

do $$ begin
  create type public.feed_coverage as enum (
    'iex',
    'sip',
    'fmv',
    'full_market',
    'official_release',
    'delayed_15m',
    'eod',
    'unknown'
  );
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.latency_class as enum (
    'realtime',
    'delayed_15m',
    'eod',
    'stale',
    'unavailable',
    'mock'
  );
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.license_scope as enum (
    'single_user_development',
    'internal_team',
    'redistributable'
  );
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.product_surface as enum (
    'dashboard_display',
    'server_calculations',
    'archived_normalized',
    'derived_charts',
    'in_app_reports',
    'pdf_inclusion',
    'email_attachment',
    'ai_analysis_input'
  );
exception when duplicate_object then null;
end $$;

-- Extend market_session with overnight when missing
do $$ begin
  alter type public.market_session add value if not exists 'overnight';
exception when others then null;
end $$;

-- ---------------------------------------------------------------------------
-- Provider license configs (non-secret)
-- Acknowledgement is an operational guardrail, not proof of a license.
-- ---------------------------------------------------------------------------

create table if not exists public.provider_license_configs (
  id uuid primary key default gen_random_uuid(),
  firm_id uuid not null references public.firms (id) on delete cascade,
  provider_key text not null,
  license_scope public.license_scope not null default 'single_user_development',
  acknowledged boolean not null default false,
  permitted_surfaces public.product_surface[] not null default '{}',
  feed_coverage public.feed_coverage not null default 'unknown',
  notes text,
  config jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (firm_id, provider_key)
);

create trigger provider_license_configs_set_updated_at
  before update on public.provider_license_configs
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Latest normalized observations (one row per instrument + provider + feed)
-- ---------------------------------------------------------------------------

create table if not exists public.market_observations_latest (
  id uuid primary key default gen_random_uuid(),
  firm_id uuid not null references public.firms (id) on delete cascade,
  instrument_id uuid not null references public.instruments (id) on delete cascade,
  provider_name text not null,
  feed_coverage public.feed_coverage not null default 'unknown',
  latency_class public.latency_class not null default 'unavailable',
  license_scope_id text not null,
  permitted_surfaces public.product_surface[] not null default '{}',
  value_kind text not null default 'normalized',
  market_session public.market_session,
  last numeric,
  bid numeric,
  ask numeric,
  open numeric,
  high numeric,
  low numeric,
  prior_close numeric,
  volume numeric,
  change_absolute numeric,
  change_percent numeric,
  currency text not null default 'USD',
  provider_timestamp timestamptz,
  retrieval_timestamp timestamptz not null default timezone('utc', now()),
  persisted_at timestamptz not null default timezone('utc', now()),
  coverage_notes text,
  raw jsonb not null default '{}'::jsonb,
  unique (firm_id, instrument_id, provider_name, feed_coverage)
);

create index if not exists market_observations_latest_firm_persisted_idx
  on public.market_observations_latest (firm_id, persisted_at desc);

create index if not exists market_observations_latest_instrument_idx
  on public.market_observations_latest (instrument_id, persisted_at desc);

-- ---------------------------------------------------------------------------
-- Bars with provider/feed provenance
-- (extends uniqueness beyond legacy market_bars instrument+interval+time)
-- ---------------------------------------------------------------------------

alter table public.market_bars
  add column if not exists feed_coverage public.feed_coverage,
  add column if not exists latency_class public.latency_class,
  add column if not exists bar_start timestamptz,
  add column if not exists firm_id uuid references public.firms (id) on delete cascade;

-- Unique bars per instrument + provider + feed + bar start (when bar_start set)
create unique index if not exists market_bars_prov_feed_start_uidx
  on public.market_bars (
    instrument_id,
    provider_name,
    coalesce(feed_coverage, 'unknown'::public.feed_coverage),
    coalesce(bar_start, bar_time)
  );

-- ---------------------------------------------------------------------------
-- Refresh runs + universe snapshot
-- ---------------------------------------------------------------------------

create table if not exists public.market_refresh_runs (
  id uuid primary key default gen_random_uuid(),
  firm_id uuid not null references public.firms (id) on delete cascade,
  status text not null default 'running',
  primary_provider text,
  fallback_provider text,
  session public.market_session,
  started_at timestamptz not null default timezone('utc', now()),
  finished_at timestamptz,
  symbols_requested integer not null default 0,
  symbols_received integer not null default 0,
  error_message text,
  details jsonb not null default '{}'::jsonb
);

create index if not exists market_refresh_runs_firm_started_idx
  on public.market_refresh_runs (firm_id, started_at desc);

create table if not exists public.market_refresh_universe_symbols (
  id uuid primary key default gen_random_uuid(),
  refresh_run_id uuid not null references public.market_refresh_runs (id) on delete cascade,
  symbol text not null,
  instrument_id uuid references public.instruments (id) on delete set null,
  source text,
  received boolean not null default false,
  unique (refresh_run_id, symbol)
);

-- ---------------------------------------------------------------------------
-- Usage counters
-- ---------------------------------------------------------------------------

create table if not exists public.provider_usage_counters (
  id uuid primary key default gen_random_uuid(),
  firm_id uuid not null references public.firms (id) on delete cascade,
  provider_key text not null,
  window_start timestamptz not null,
  window_kind text not null check (window_kind in ('minute', 'hour', 'day')),
  request_count integer not null default 0,
  symbol_count integer not null default 0,
  error_count integer not null default 0,
  unique (firm_id, provider_key, window_start, window_kind)
);

create index if not exists provider_usage_counters_firm_window_idx
  on public.provider_usage_counters (firm_id, window_start desc);

-- ---------------------------------------------------------------------------
-- Extend provider_health_events for entitlement / fallback
-- ---------------------------------------------------------------------------

alter table public.provider_health_events
  add column if not exists firm_id uuid references public.firms (id) on delete cascade,
  add column if not exists event_kind text,
  add column if not exists provider_key text;

create index if not exists provider_health_events_firm_created_idx
  on public.provider_health_events (firm_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Immutable report market snapshots
-- ---------------------------------------------------------------------------

create table if not exists public.report_market_snapshots (
  id uuid primary key default gen_random_uuid(),
  firm_id uuid not null references public.firms (id) on delete cascade,
  report_id uuid,
  report_run_id uuid,
  data_cutoff timestamptz not null,
  provenance jsonb not null default '{}'::jsonb,
  observations jsonb not null default '[]'::jsonb,
  calculations jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists report_market_snapshots_firm_created_idx
  on public.report_market_snapshots (firm_id, created_at desc);

create index if not exists report_market_snapshots_report_idx
  on public.report_market_snapshots (report_id)
  where report_id is not null;

-- ---------------------------------------------------------------------------
-- RLS
-- Members read firm data; only admins mutate license/config and operational writes
-- that are not service-role.
-- ---------------------------------------------------------------------------

alter table public.provider_license_configs enable row level security;
alter table public.market_observations_latest enable row level security;
alter table public.market_refresh_runs enable row level security;
alter table public.market_refresh_universe_symbols enable row level security;
alter table public.provider_usage_counters enable row level security;
alter table public.report_market_snapshots enable row level security;

-- License configs: members read; admins mutate
create policy provider_license_configs_select_member
  on public.provider_license_configs for select to authenticated
  using (firm_id = public.auth_firm_id() and public.auth_is_active_member());

create policy provider_license_configs_admin_write
  on public.provider_license_configs for all to authenticated
  using (firm_id = public.auth_firm_id() and public.auth_is_admin())
  with check (firm_id = public.auth_firm_id() and public.auth_is_admin());

-- Latest observations: members read firm rows
create policy market_observations_latest_select_member
  on public.market_observations_latest for select to authenticated
  using (firm_id = public.auth_firm_id() and public.auth_is_active_member());

create policy market_observations_latest_admin_write
  on public.market_observations_latest for all to authenticated
  using (firm_id = public.auth_firm_id() and public.auth_is_admin())
  with check (firm_id = public.auth_firm_id() and public.auth_is_admin());

-- Refresh runs
create policy market_refresh_runs_select_member
  on public.market_refresh_runs for select to authenticated
  using (firm_id = public.auth_firm_id() and public.auth_is_active_member());

create policy market_refresh_runs_admin_write
  on public.market_refresh_runs for all to authenticated
  using (firm_id = public.auth_firm_id() and public.auth_is_admin())
  with check (firm_id = public.auth_firm_id() and public.auth_is_admin());

create policy market_refresh_universe_select_member
  on public.market_refresh_universe_symbols for select to authenticated
  using (
    exists (
      select 1
      from public.market_refresh_runs r
      where r.id = market_refresh_universe_symbols.refresh_run_id
        and r.firm_id = public.auth_firm_id()
        and public.auth_is_active_member()
    )
  );

create policy market_refresh_universe_admin_write
  on public.market_refresh_universe_symbols for all to authenticated
  using (
    exists (
      select 1
      from public.market_refresh_runs r
      where r.id = market_refresh_universe_symbols.refresh_run_id
        and r.firm_id = public.auth_firm_id()
        and public.auth_is_admin()
    )
  )
  with check (
    exists (
      select 1
      from public.market_refresh_runs r
      where r.id = market_refresh_universe_symbols.refresh_run_id
        and r.firm_id = public.auth_firm_id()
        and public.auth_is_admin()
    )
  );

-- Usage counters: members read; admins write
create policy provider_usage_counters_select_member
  on public.provider_usage_counters for select to authenticated
  using (firm_id = public.auth_firm_id() and public.auth_is_active_member());

create policy provider_usage_counters_admin_write
  on public.provider_usage_counters for all to authenticated
  using (firm_id = public.auth_firm_id() and public.auth_is_admin())
  with check (firm_id = public.auth_firm_id() and public.auth_is_admin());

-- Report snapshots: members read; admins write
create policy report_market_snapshots_select_member
  on public.report_market_snapshots for select to authenticated
  using (firm_id = public.auth_firm_id() and public.auth_is_active_member());

create policy report_market_snapshots_admin_write
  on public.report_market_snapshots for all to authenticated
  using (firm_id = public.auth_firm_id() and public.auth_is_admin())
  with check (firm_id = public.auth_firm_id() and public.auth_is_admin());
