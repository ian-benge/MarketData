-- Financial News Intelligence Platform — initial schema
-- Single-tenant firm model with invite-only auth and RLS.

create extension if not exists "pgcrypto";
create extension if not exists "pg_trgm";

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

create type public.user_role as enum ('admin', 'member');

create type public.invitation_status as enum (
  'pending',
  'accepted',
  'revoked',
  'expired'
);

create type public.report_edition as enum ('premarket', 'midday', 'close');

create type public.report_run_status as enum (
  'queued',
  'collecting_sources',
  'normalizing_market_data',
  'detecting_material_events',
  'analyzing_and_drafting',
  'validating_claims',
  'rendering_pdf',
  'archiving',
  'delivering_email',
  'completed',
  'partial',
  'failed',
  'cancelled'
);

create type public.causal_status as enum (
  'confirmed',
  'reported',
  'inferred',
  'unclear'
);

create type public.proposal_status as enum (
  'pending',
  'approved',
  'rejected',
  'withdrawn'
);

create type public.delivery_status as enum (
  'queued',
  'sending',
  'delivered',
  'failed',
  'bounced',
  'skipped'
);

create type public.source_class as enum (
  'market',
  'news',
  'macro',
  'corporate',
  'ai',
  'email',
  'rss',
  'mock'
);

create type public.market_session as enum (
  'premarket',
  'regular',
  'afterhours',
  'closed'
);

create type public.delay_status as enum ('realtime', 'delayed', 'unknown');

create type public.source_quality as enum (
  'primary',
  'secondary',
  'estimated',
  'mock'
);

-- ---------------------------------------------------------------------------
-- updated_at helper
-- ---------------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Core tenancy / auth
-- ---------------------------------------------------------------------------

create table public.firms (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  display_name text,
  avatar_url text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table public.team_memberships (
  id uuid primary key default gen_random_uuid(),
  firm_id uuid not null references public.firms (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role public.user_role not null default 'member',
  is_active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (firm_id, user_id)
);

create table public.invitations (
  id uuid primary key default gen_random_uuid(),
  firm_id uuid not null references public.firms (id) on delete cascade,
  email text not null,
  role public.user_role not null default 'member',
  status public.invitation_status not null default 'pending',
  invited_by uuid references public.profiles (id) on delete set null,
  token_hash text not null unique,
  expires_at timestamptz not null,
  accepted_at timestamptz,
  accepted_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create unique index invitations_pending_email_firm_uidx
  on public.invitations (firm_id, lower(email))
  where status = 'pending';

-- ---------------------------------------------------------------------------
-- Market universe
-- ---------------------------------------------------------------------------

create table public.instruments (
  id uuid primary key default gen_random_uuid(),
  symbol text not null,
  name text not null,
  asset_class text not null default 'equity',
  exchange text,
  currency text not null default 'USD',
  market_cap_category text,
  is_active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (symbol)
);

create table public.watchlists (
  id uuid primary key default gen_random_uuid(),
  firm_id uuid not null references public.firms (id) on delete cascade,
  name text not null,
  description text,
  is_default boolean not null default false,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (firm_id, name)
);

create table public.watchlist_items (
  id uuid primary key default gen_random_uuid(),
  watchlist_id uuid not null references public.watchlists (id) on delete cascade,
  instrument_id uuid not null references public.instruments (id) on delete cascade,
  notes text,
  sort_order integer not null default 0,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (watchlist_id, instrument_id)
);

create table public.sectors (
  id uuid primary key default gen_random_uuid(),
  firm_id uuid not null references public.firms (id) on delete cascade,
  slug text not null,
  name text not null,
  description text,
  sort_order integer not null default 0,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (firm_id, slug)
);

create table public.sector_instruments (
  id uuid primary key default gen_random_uuid(),
  sector_id uuid not null references public.sectors (id) on delete cascade,
  instrument_id uuid not null references public.instruments (id) on delete cascade,
  sort_order integer not null default 0,
  created_at timestamptz not null default timezone('utc', now()),
  unique (sector_id, instrument_id)
);

create table public.market_snapshots (
  id uuid primary key default gen_random_uuid(),
  instrument_id uuid not null references public.instruments (id) on delete cascade,
  as_of timestamptz not null,
  last numeric,
  bid numeric,
  ask numeric,
  open numeric,
  high numeric,
  low numeric,
  prev_close numeric,
  volume numeric,
  change_pct numeric,
  market_session public.market_session,
  delay_status public.delay_status not null default 'unknown',
  source_quality public.source_quality not null default 'secondary',
  provider_name text not null,
  provider_timestamp timestamptz,
  retrieval_timestamp timestamptz not null default timezone('utc', now()),
  raw jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

create index market_snapshots_instrument_as_of_idx
  on public.market_snapshots (instrument_id, as_of desc);

create table public.market_bars (
  id uuid primary key default gen_random_uuid(),
  instrument_id uuid not null references public.instruments (id) on delete cascade,
  interval text not null,
  bar_time timestamptz not null,
  open numeric,
  high numeric,
  low numeric,
  close numeric,
  volume numeric,
  delay_status public.delay_status not null default 'unknown',
  source_quality public.source_quality not null default 'secondary',
  provider_name text not null,
  created_at timestamptz not null default timezone('utc', now()),
  unique (instrument_id, interval, bar_time)
);

create index market_bars_instrument_time_idx
  on public.market_bars (instrument_id, bar_time desc);

-- ---------------------------------------------------------------------------
-- Providers
-- ---------------------------------------------------------------------------

create table public.provider_configs (
  id uuid primary key default gen_random_uuid(),
  firm_id uuid not null references public.firms (id) on delete cascade,
  provider_key text not null,
  display_name text not null,
  source_class public.source_class not null,
  enabled boolean not null default true,
  is_primary boolean not null default false,
  priority integer not null default 100,
  rate_limit_per_minute integer,
  -- Non-secret operational config only (endpoints, series ids, feed urls, models).
  config jsonb not null default '{}'::jsonb,
  health_status text,
  last_health_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (firm_id, provider_key)
);

create table public.provider_health_events (
  id uuid primary key default gen_random_uuid(),
  provider_config_id uuid not null references public.provider_configs (id) on delete cascade,
  status text not null,
  latency_ms integer,
  message text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

create index provider_health_events_config_created_idx
  on public.provider_health_events (provider_config_id, created_at desc);

-- ---------------------------------------------------------------------------
-- News / sources / calendar
-- ---------------------------------------------------------------------------

create table public.news_items (
  id uuid primary key default gen_random_uuid(),
  firm_id uuid not null references public.firms (id) on delete cascade,
  provider_name text not null,
  external_id text,
  title text not null,
  summary text,
  url text,
  canonical_url text,
  content_hash text,
  published_at timestamptz,
  source_name text,
  tickers text[] not null default '{}',
  source_quality public.source_quality not null default 'secondary',
  raw jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

create unique index news_items_provider_external_uidx
  on public.news_items (firm_id, provider_name, external_id)
  where external_id is not null;

create index news_items_published_idx on public.news_items (firm_id, published_at desc);
create index news_items_content_hash_idx on public.news_items (firm_id, content_hash);

create table public.news_clusters (
  id uuid primary key default gen_random_uuid(),
  firm_id uuid not null references public.firms (id) on delete cascade,
  canonical_title text not null,
  summary text,
  primary_news_id uuid references public.news_items (id) on delete set null,
  member_news_ids uuid[] not null default '{}',
  cluster_hash text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index news_clusters_firm_created_idx
  on public.news_clusters (firm_id, created_at desc);

create table public.source_documents (
  id uuid primary key default gen_random_uuid(),
  firm_id uuid not null references public.firms (id) on delete cascade,
  source_class public.source_class not null,
  title text not null,
  url text,
  content_hash text,
  published_at timestamptz,
  retrieved_at timestamptz not null default timezone('utc', now()),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

create index source_documents_firm_retrieved_idx
  on public.source_documents (firm_id, retrieved_at desc);

create table public.economic_events (
  id uuid primary key default gen_random_uuid(),
  event_date date not null,
  event_time time,
  country text not null default 'US',
  title text not null,
  importance text,
  actual text,
  forecast text,
  previous text,
  provider_name text not null,
  raw jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

create index economic_events_date_idx on public.economic_events (event_date desc);

create table public.earnings_events (
  id uuid primary key default gen_random_uuid(),
  instrument_id uuid not null references public.instruments (id) on delete cascade,
  earnings_date date not null,
  fiscal_period text,
  eps_estimate numeric,
  eps_actual numeric,
  revenue_estimate numeric,
  revenue_actual numeric,
  time_of_day text,
  provider_name text not null,
  raw jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

create index earnings_events_date_idx
  on public.earnings_events (earnings_date desc, instrument_id);

-- ---------------------------------------------------------------------------
-- Reports pipeline
-- ---------------------------------------------------------------------------

create table public.report_configs (
  id uuid primary key default gen_random_uuid(),
  firm_id uuid not null references public.firms (id) on delete cascade,
  name text not null,
  timezone text not null default 'America/Chicago',
  editions jsonb not null default jsonb_build_object(
    'premarket', '07:30',
    'midday', '11:30',
    'close', '15:30'
  ),
  enabled boolean not null default true,
  partial_delivery_allowed boolean not null default true,
  quality_gate_settings jsonb not null default '{}'::jsonb,
  email_settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (firm_id, name)
);

create table public.report_runs (
  id uuid primary key default gen_random_uuid(),
  firm_id uuid not null references public.firms (id) on delete cascade,
  report_config_id uuid references public.report_configs (id) on delete set null,
  edition public.report_edition not null,
  trading_date date not null,
  status public.report_run_status not null default 'queued',
  idempotency_key text not null,
  triggered_by uuid references public.profiles (id) on delete set null,
  started_at timestamptz,
  completed_at timestamptz,
  error_message text,
  stage_metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (idempotency_key)
);

create index report_runs_firm_trading_idx
  on public.report_runs (firm_id, trading_date desc, edition);

create table public.report_run_stages (
  id uuid primary key default gen_random_uuid(),
  report_run_id uuid not null references public.report_runs (id) on delete cascade,
  stage public.report_run_status not null,
  status text not null default 'pending',
  started_at timestamptz,
  completed_at timestamptz,
  error_message text,
  metrics jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  unique (report_run_id, stage)
);

create table public.reports (
  id uuid primary key default gen_random_uuid(),
  firm_id uuid not null references public.firms (id) on delete cascade,
  report_run_id uuid references public.report_runs (id) on delete set null,
  edition public.report_edition not null,
  trading_date date not null,
  title text not null,
  executive_summary text,
  status text not null default 'draft',
  published_at timestamptz,
  -- Maintained by FTS trigger in 20260810000001_rls_and_search.sql
  search_vector tsvector,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index reports_firm_trading_idx
  on public.reports (firm_id, trading_date desc, edition);

create table public.report_sections (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.reports (id) on delete cascade,
  section_key text not null,
  title text not null,
  body_markdown text not null default '',
  sort_order integer not null default 0,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (report_id, section_key)
);

create table public.report_claims (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.reports (id) on delete cascade,
  section_id uuid references public.report_sections (id) on delete set null,
  claim_text text not null,
  causal_status public.causal_status not null default 'unclear',
  materiality text,
  instrument_ids uuid[] not null default '{}',
  created_at timestamptz not null default timezone('utc', now())
);

create index report_claims_report_idx on public.report_claims (report_id);

create table public.citations (
  id uuid primary key default gen_random_uuid(),
  claim_id uuid not null references public.report_claims (id) on delete cascade,
  source_document_id uuid references public.source_documents (id) on delete set null,
  news_item_id uuid references public.news_items (id) on delete set null,
  excerpt text,
  created_at timestamptz not null default timezone('utc', now()),
  check (source_document_id is not null or news_item_id is not null)
);

create table public.report_files (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.reports (id) on delete cascade,
  file_type text not null,
  storage_path text not null,
  content_type text,
  byte_size bigint,
  created_at timestamptz not null default timezone('utc', now()),
  unique (report_id, file_type)
);

create table public.email_deliveries (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.reports (id) on delete cascade,
  recipient_user_id uuid not null references public.profiles (id) on delete cascade,
  recipient_email text not null,
  status public.delivery_status not null default 'queued',
  provider_message_id text,
  sent_at timestamptz,
  error_message text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (report_id, recipient_user_id)
);

-- ---------------------------------------------------------------------------
-- Ops / governance
-- ---------------------------------------------------------------------------

create table public.change_proposals (
  id uuid primary key default gen_random_uuid(),
  firm_id uuid not null references public.firms (id) on delete cascade,
  proposed_by uuid references public.profiles (id) on delete set null,
  proposal_type text not null,
  title text not null,
  description text,
  payload jsonb not null default '{}'::jsonb,
  status public.proposal_status not null default 'pending',
  reviewed_by uuid references public.profiles (id) on delete set null,
  reviewed_at timestamptz,
  review_notes text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index change_proposals_firm_status_idx
  on public.change_proposals (firm_id, status, created_at desc);

create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  firm_id uuid references public.firms (id) on delete set null,
  actor_user_id uuid references public.profiles (id) on delete set null,
  action text not null,
  entity_type text,
  entity_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

create index audit_logs_firm_created_idx
  on public.audit_logs (firm_id, created_at desc);

create table public.ai_usage_events (
  id uuid primary key default gen_random_uuid(),
  firm_id uuid not null references public.firms (id) on delete cascade,
  report_run_id uuid references public.report_runs (id) on delete set null,
  provider_name text not null,
  model text,
  purpose text,
  input_tokens integer,
  output_tokens integer,
  latency_ms integer,
  cost_usd numeric(12, 6),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

create index ai_usage_events_firm_created_idx
  on public.ai_usage_events (firm_id, created_at desc);

-- ---------------------------------------------------------------------------
-- updated_at triggers
-- ---------------------------------------------------------------------------

create trigger firms_set_updated_at
  before update on public.firms
  for each row execute function public.set_updated_at();

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

create trigger team_memberships_set_updated_at
  before update on public.team_memberships
  for each row execute function public.set_updated_at();

create trigger invitations_set_updated_at
  before update on public.invitations
  for each row execute function public.set_updated_at();

create trigger instruments_set_updated_at
  before update on public.instruments
  for each row execute function public.set_updated_at();

create trigger watchlists_set_updated_at
  before update on public.watchlists
  for each row execute function public.set_updated_at();

create trigger watchlist_items_set_updated_at
  before update on public.watchlist_items
  for each row execute function public.set_updated_at();

create trigger sectors_set_updated_at
  before update on public.sectors
  for each row execute function public.set_updated_at();

create trigger provider_configs_set_updated_at
  before update on public.provider_configs
  for each row execute function public.set_updated_at();

create trigger news_clusters_set_updated_at
  before update on public.news_clusters
  for each row execute function public.set_updated_at();

create trigger report_configs_set_updated_at
  before update on public.report_configs
  for each row execute function public.set_updated_at();

create trigger report_runs_set_updated_at
  before update on public.report_runs
  for each row execute function public.set_updated_at();

create trigger reports_set_updated_at
  before update on public.reports
  for each row execute function public.set_updated_at();

create trigger report_sections_set_updated_at
  before update on public.report_sections
  for each row execute function public.set_updated_at();

create trigger email_deliveries_set_updated_at
  before update on public.email_deliveries
  for each row execute function public.set_updated_at();

create trigger change_proposals_set_updated_at
  before update on public.change_proposals
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Auth helper functions (SECURITY DEFINER; service role bypasses RLS by default)
-- ---------------------------------------------------------------------------

create or replace function public.auth_firm_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select tm.firm_id
  from public.team_memberships tm
  where tm.user_id = auth.uid()
    and tm.is_active = true
  order by tm.created_at asc
  limit 1;
$$;

create or replace function public.auth_is_active_member()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.team_memberships tm
    where tm.user_id = auth.uid()
      and tm.is_active = true
  );
$$;

create or replace function public.auth_is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.team_memberships tm
    where tm.user_id = auth.uid()
      and tm.is_active = true
      and tm.role = 'admin'
  );
$$;

revoke all on function public.auth_firm_id() from public;
revoke all on function public.auth_is_active_member() from public;
revoke all on function public.auth_is_admin() from public;
grant execute on function public.auth_firm_id() to authenticated;
grant execute on function public.auth_is_active_member() to authenticated;
grant execute on function public.auth_is_admin() to authenticated;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table public.firms enable row level security;
alter table public.profiles enable row level security;
alter table public.team_memberships enable row level security;
alter table public.invitations enable row level security;
alter table public.instruments enable row level security;
alter table public.watchlists enable row level security;
alter table public.watchlist_items enable row level security;
alter table public.sectors enable row level security;
alter table public.sector_instruments enable row level security;
alter table public.market_snapshots enable row level security;
alter table public.market_bars enable row level security;
alter table public.provider_configs enable row level security;
alter table public.provider_health_events enable row level security;
alter table public.news_items enable row level security;
alter table public.news_clusters enable row level security;
alter table public.source_documents enable row level security;
alter table public.economic_events enable row level security;
alter table public.earnings_events enable row level security;
alter table public.report_configs enable row level security;
alter table public.report_runs enable row level security;
alter table public.report_run_stages enable row level security;
alter table public.reports enable row level security;
alter table public.report_sections enable row level security;
alter table public.report_claims enable row level security;
alter table public.citations enable row level security;
alter table public.report_files enable row level security;
alter table public.email_deliveries enable row level security;
alter table public.change_proposals enable row level security;
alter table public.audit_logs enable row level security;
alter table public.ai_usage_events enable row level security;

-- Firms: active members can read their firm
create policy firms_select_member
  on public.firms for select to authenticated
  using (id = public.auth_firm_id() and public.auth_is_active_member());

-- Profiles: self + firm teammates
create policy profiles_select_self_or_firm
  on public.profiles for select to authenticated
  using (
    id = auth.uid()
    or exists (
      select 1
      from public.team_memberships mine
      join public.team_memberships theirs
        on theirs.firm_id = mine.firm_id
      where mine.user_id = auth.uid()
        and mine.is_active = true
        and theirs.user_id = profiles.id
        and theirs.is_active = true
    )
  );

create policy profiles_update_self
  on public.profiles for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- Team memberships
create policy team_memberships_select_firm
  on public.team_memberships for select to authenticated
  using (firm_id = public.auth_firm_id() and public.auth_is_active_member());

create policy team_memberships_admin_write
  on public.team_memberships for all to authenticated
  using (firm_id = public.auth_firm_id() and public.auth_is_admin())
  with check (firm_id = public.auth_firm_id() and public.auth_is_admin());

-- Invitations: admin manage, members can see pending for awareness
create policy invitations_select_firm
  on public.invitations for select to authenticated
  using (firm_id = public.auth_firm_id() and public.auth_is_active_member());

create policy invitations_admin_insert
  on public.invitations for insert to authenticated
  with check (firm_id = public.auth_firm_id() and public.auth_is_admin());

create policy invitations_admin_update
  on public.invitations for update to authenticated
  using (firm_id = public.auth_firm_id() and public.auth_is_admin())
  with check (firm_id = public.auth_firm_id() and public.auth_is_admin());

create policy invitations_admin_delete
  on public.invitations for delete to authenticated
  using (firm_id = public.auth_firm_id() and public.auth_is_admin());

-- Instruments: readable by active members (shared universe)
create policy instruments_select_member
  on public.instruments for select to authenticated
  using (public.auth_is_active_member());

create policy instruments_admin_write
  on public.instruments for all to authenticated
  using (public.auth_is_admin())
  with check (public.auth_is_admin());

-- Watchlists / items / sectors: members read + write for their firm
create policy watchlists_select_firm
  on public.watchlists for select to authenticated
  using (firm_id = public.auth_firm_id() and public.auth_is_active_member());

create policy watchlists_insert_member
  on public.watchlists for insert to authenticated
  with check (firm_id = public.auth_firm_id() and public.auth_is_active_member());

create policy watchlists_update_member
  on public.watchlists for update to authenticated
  using (firm_id = public.auth_firm_id() and public.auth_is_active_member())
  with check (firm_id = public.auth_firm_id() and public.auth_is_active_member());

create policy watchlists_delete_member
  on public.watchlists for delete to authenticated
  using (firm_id = public.auth_firm_id() and public.auth_is_active_member());

create policy watchlist_items_select_firm
  on public.watchlist_items for select to authenticated
  using (
    exists (
      select 1 from public.watchlists w
      where w.id = watchlist_items.watchlist_id
        and w.firm_id = public.auth_firm_id()
    )
    and public.auth_is_active_member()
  );

create policy watchlist_items_insert_member
  on public.watchlist_items for insert to authenticated
  with check (
    exists (
      select 1 from public.watchlists w
      where w.id = watchlist_items.watchlist_id
        and w.firm_id = public.auth_firm_id()
    )
    and public.auth_is_active_member()
  );

create policy watchlist_items_update_member
  on public.watchlist_items for update to authenticated
  using (
    exists (
      select 1 from public.watchlists w
      where w.id = watchlist_items.watchlist_id
        and w.firm_id = public.auth_firm_id()
    )
    and public.auth_is_active_member()
  )
  with check (
    exists (
      select 1 from public.watchlists w
      where w.id = watchlist_items.watchlist_id
        and w.firm_id = public.auth_firm_id()
    )
    and public.auth_is_active_member()
  );

create policy watchlist_items_delete_member
  on public.watchlist_items for delete to authenticated
  using (
    exists (
      select 1 from public.watchlists w
      where w.id = watchlist_items.watchlist_id
        and w.firm_id = public.auth_firm_id()
    )
    and public.auth_is_active_member()
  );

create policy sectors_select_firm
  on public.sectors for select to authenticated
  using (firm_id = public.auth_firm_id() and public.auth_is_active_member());

create policy sectors_insert_member
  on public.sectors for insert to authenticated
  with check (firm_id = public.auth_firm_id() and public.auth_is_active_member());

create policy sectors_update_member
  on public.sectors for update to authenticated
  using (firm_id = public.auth_firm_id() and public.auth_is_active_member())
  with check (firm_id = public.auth_firm_id() and public.auth_is_active_member());

create policy sectors_delete_member
  on public.sectors for delete to authenticated
  using (firm_id = public.auth_firm_id() and public.auth_is_active_member());

create policy sector_instruments_select_firm
  on public.sector_instruments for select to authenticated
  using (
    exists (
      select 1 from public.sectors s
      where s.id = sector_instruments.sector_id
        and s.firm_id = public.auth_firm_id()
    )
    and public.auth_is_active_member()
  );

create policy sector_instruments_insert_member
  on public.sector_instruments for insert to authenticated
  with check (
    exists (
      select 1 from public.sectors s
      where s.id = sector_instruments.sector_id
        and s.firm_id = public.auth_firm_id()
    )
    and public.auth_is_active_member()
  );

create policy sector_instruments_update_member
  on public.sector_instruments for update to authenticated
  using (
    exists (
      select 1 from public.sectors s
      where s.id = sector_instruments.sector_id
        and s.firm_id = public.auth_firm_id()
    )
    and public.auth_is_active_member()
  )
  with check (
    exists (
      select 1 from public.sectors s
      where s.id = sector_instruments.sector_id
        and s.firm_id = public.auth_firm_id()
    )
    and public.auth_is_active_member()
  );

create policy sector_instruments_delete_member
  on public.sector_instruments for delete to authenticated
  using (
    exists (
      select 1 from public.sectors s
      where s.id = sector_instruments.sector_id
        and s.firm_id = public.auth_firm_id()
    )
    and public.auth_is_active_member()
  );

-- Market data readable by members
create policy market_snapshots_select_member
  on public.market_snapshots for select to authenticated
  using (public.auth_is_active_member());

create policy market_bars_select_member
  on public.market_bars for select to authenticated
  using (public.auth_is_active_member());

create policy economic_events_select_member
  on public.economic_events for select to authenticated
  using (public.auth_is_active_member());

create policy earnings_events_select_member
  on public.earnings_events for select to authenticated
  using (public.auth_is_active_member());

-- Provider configs: members read; admins manage
create policy provider_configs_select_firm
  on public.provider_configs for select to authenticated
  using (firm_id = public.auth_firm_id() and public.auth_is_active_member());

create policy provider_configs_admin_write
  on public.provider_configs for all to authenticated
  using (firm_id = public.auth_firm_id() and public.auth_is_admin())
  with check (firm_id = public.auth_firm_id() and public.auth_is_admin());

create policy provider_health_events_select_firm
  on public.provider_health_events for select to authenticated
  using (
    exists (
      select 1 from public.provider_configs pc
      where pc.id = provider_health_events.provider_config_id
        and pc.firm_id = public.auth_firm_id()
    )
    and public.auth_is_active_member()
  );

create policy provider_health_events_admin_write
  on public.provider_health_events for all to authenticated
  using (
    exists (
      select 1 from public.provider_configs pc
      where pc.id = provider_health_events.provider_config_id
        and pc.firm_id = public.auth_firm_id()
    )
    and public.auth_is_admin()
  )
  with check (
    exists (
      select 1 from public.provider_configs pc
      where pc.id = provider_health_events.provider_config_id
        and pc.firm_id = public.auth_firm_id()
    )
    and public.auth_is_admin()
  );

-- News / sources
create policy news_items_select_firm
  on public.news_items for select to authenticated
  using (firm_id = public.auth_firm_id() and public.auth_is_active_member());

create policy news_clusters_select_firm
  on public.news_clusters for select to authenticated
  using (firm_id = public.auth_firm_id() and public.auth_is_active_member());

create policy source_documents_select_firm
  on public.source_documents for select to authenticated
  using (firm_id = public.auth_firm_id() and public.auth_is_active_member());

-- Report configs: members read; admins manage
create policy report_configs_select_firm
  on public.report_configs for select to authenticated
  using (firm_id = public.auth_firm_id() and public.auth_is_active_member());

create policy report_configs_admin_write
  on public.report_configs for all to authenticated
  using (firm_id = public.auth_firm_id() and public.auth_is_admin())
  with check (firm_id = public.auth_firm_id() and public.auth_is_admin());

-- Report runs / stages / reports tree readable by firm members
create policy report_runs_select_firm
  on public.report_runs for select to authenticated
  using (firm_id = public.auth_firm_id() and public.auth_is_active_member());

create policy report_run_stages_select_firm
  on public.report_run_stages for select to authenticated
  using (
    exists (
      select 1 from public.report_runs rr
      where rr.id = report_run_stages.report_run_id
        and rr.firm_id = public.auth_firm_id()
    )
    and public.auth_is_active_member()
  );

create policy reports_select_firm
  on public.reports for select to authenticated
  using (firm_id = public.auth_firm_id() and public.auth_is_active_member());

create policy report_sections_select_firm
  on public.report_sections for select to authenticated
  using (
    exists (
      select 1 from public.reports r
      where r.id = report_sections.report_id
        and r.firm_id = public.auth_firm_id()
    )
    and public.auth_is_active_member()
  );

create policy report_claims_select_firm
  on public.report_claims for select to authenticated
  using (
    exists (
      select 1 from public.reports r
      where r.id = report_claims.report_id
        and r.firm_id = public.auth_firm_id()
    )
    and public.auth_is_active_member()
  );

create policy citations_select_firm
  on public.citations for select to authenticated
  using (
    exists (
      select 1
      from public.report_claims rc
      join public.reports r on r.id = rc.report_id
      where rc.id = citations.claim_id
        and r.firm_id = public.auth_firm_id()
    )
    and public.auth_is_active_member()
  );

create policy report_files_select_firm
  on public.report_files for select to authenticated
  using (
    exists (
      select 1 from public.reports r
      where r.id = report_files.report_id
        and r.firm_id = public.auth_firm_id()
    )
    and public.auth_is_active_member()
  );

create policy email_deliveries_select_firm
  on public.email_deliveries for select to authenticated
  using (
    (
      recipient_user_id = auth.uid()
      or public.auth_is_admin()
    )
    and exists (
      select 1 from public.reports r
      where r.id = email_deliveries.report_id
        and r.firm_id = public.auth_firm_id()
    )
    and public.auth_is_active_member()
  );

-- Change proposals: members can create/read; only admins approve/update status
create policy change_proposals_select_firm
  on public.change_proposals for select to authenticated
  using (firm_id = public.auth_firm_id() and public.auth_is_active_member());

create policy change_proposals_insert_member
  on public.change_proposals for insert to authenticated
  with check (
    firm_id = public.auth_firm_id()
    and public.auth_is_active_member()
    and proposed_by = auth.uid()
    and status = 'pending'
  );

create policy change_proposals_admin_update
  on public.change_proposals for update to authenticated
  using (firm_id = public.auth_firm_id() and public.auth_is_admin())
  with check (firm_id = public.auth_firm_id() and public.auth_is_admin());

-- Audit + AI usage: members read firm rows; admins full read
create policy audit_logs_select_firm
  on public.audit_logs for select to authenticated
  using (
    (firm_id = public.auth_firm_id() or firm_id is null)
    and public.auth_is_active_member()
  );

create policy ai_usage_events_select_firm
  on public.ai_usage_events for select to authenticated
  using (firm_id = public.auth_firm_id() and public.auth_is_active_member());
