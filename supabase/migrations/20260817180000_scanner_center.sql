-- Scanner Center: durable ranked lists, alert history, presets, and replay.
-- Market-wide scanner rows are firm-scoped for multi-tenant isolation.
-- Members may read firm scanner data. Writes are service-role only except
-- user presets, alert settings, pins, and mutes.

create table public.scanner_runs (
  id uuid primary key default gen_random_uuid(),
  firm_id uuid not null references public.firms (id) on delete cascade,
  started_at timestamptz not null default timezone('utc', now()),
  finished_at timestamptz,
  session text not null,
  session_date date not null,
  status text not null default 'running'
    check (status in ('running', 'completed', 'failed', 'skipped')),
  cadence_seconds integer not null,
  symbols_requested integer not null default 0,
  symbols_received integer not null default 0,
  alerts_emitted integer not null default 0,
  alerts_consolidated integer not null default 0,
  provider_name text,
  feed_coverage text,
  latency_class text,
  coverage_notes text,
  error_message text,
  skipped_reason text,
  meta jsonb not null default '{}'::jsonb
);

create index scanner_runs_firm_started_idx
  on public.scanner_runs (firm_id, started_at desc);

create table public.scanner_feature_snapshots (
  firm_id uuid not null references public.firms (id) on delete cascade,
  ticker text not null,
  captured_at timestamptz not null,
  session text not null,
  session_date date not null,
  features jsonb not null,
  provider_name text,
  feed_coverage text,
  latency_class text,
  stale boolean not null default false,
  primary key (firm_id, ticker)
);

create index scanner_feature_snapshots_session_idx
  on public.scanner_feature_snapshots (firm_id, session_date, captured_at desc);

create table public.scanner_feature_history (
  id uuid primary key default gen_random_uuid(),
  firm_id uuid not null references public.firms (id) on delete cascade,
  ticker text not null,
  captured_at timestamptz not null,
  session text not null,
  session_date date not null,
  run_id uuid references public.scanner_runs (id) on delete set null,
  features jsonb not null
);

create index scanner_feature_history_ticker_idx
  on public.scanner_feature_history (firm_id, ticker, captured_at desc);

create index scanner_feature_history_session_idx
  on public.scanner_feature_history (firm_id, session_date, captured_at desc);

create table public.scanner_ranked_rows (
  id uuid primary key default gen_random_uuid(),
  firm_id uuid not null references public.firms (id) on delete cascade,
  run_id uuid references public.scanner_runs (id) on delete set null,
  system text not null check (system in ('momentum', 'desk')),
  strategy_id text not null,
  session text not null,
  session_date date not null,
  rank integer not null,
  ticker text not null,
  score numeric,
  row jsonb not null,
  captured_at timestamptz not null
);

create unique index scanner_ranked_rows_uidx
  on public.scanner_ranked_rows (firm_id, system, strategy_id, session_date, ticker);

create index scanner_ranked_rows_list_idx
  on public.scanner_ranked_rows (firm_id, system, strategy_id, session_date, rank);

create table public.scanner_alert_events (
  id uuid primary key default gen_random_uuid(),
  firm_id uuid not null references public.firms (id) on delete cascade,
  run_id uuid references public.scanner_runs (id) on delete set null,
  system text not null check (system in ('momentum', 'desk')),
  strategy_id text not null,
  ticker text not null,
  fired_at timestamptz not null,
  session text not null,
  session_date date not null,
  status text not null default 'active'
    check (status in ('active', 'consolidated', 'suppressed', 'expired')),
  consolidation_id uuid,
  occurrence_count integer not null default 1,
  last_seen_at timestamptz not null,
  cooldown_until timestamptz,
  payload jsonb not null,
  quality jsonb not null default '{}'::jsonb
);

create index scanner_alert_events_tape_idx
  on public.scanner_alert_events (firm_id, fired_at desc);

create index scanner_alert_events_ticker_idx
  on public.scanner_alert_events (firm_id, ticker, strategy_id, fired_at desc);

create index scanner_alert_events_session_idx
  on public.scanner_alert_events (firm_id, session_date, system, strategy_id);

create index scanner_alert_events_consolidation_idx
  on public.scanner_alert_events (consolidation_id)
  where consolidation_id is not null;

create table public.scanner_ticker_profiles (
  firm_id uuid not null references public.firms (id) on delete cascade,
  ticker text not null,
  updated_at timestamptz not null default timezone('utc', now()),
  former_runner boolean not null default false,
  gap_and_fade boolean not null default false,
  offering_risk boolean not null default false,
  frequent_halt boolean not null default false,
  halt_count_90d integer not null default 0,
  extreme_move_days_90d integer not null default 0,
  max_intraday_move_90d numeric,
  catalyst_response jsonb not null default '{}'::jsonb,
  notes text,
  stats jsonb not null default '{}'::jsonb,
  primary key (firm_id, ticker)
);

create table public.scanner_halts (
  id uuid primary key default gen_random_uuid(),
  firm_id uuid not null references public.firms (id) on delete cascade,
  ticker text not null,
  status text not null check (status in ('halted', 'resumed')),
  reason text,
  reason_code text,
  halted_at timestamptz not null,
  resumed_at timestamptz,
  source text not null,
  raw jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

create index scanner_halts_ticker_idx
  on public.scanner_halts (firm_id, ticker, halted_at desc);

create unique index scanner_halts_open_uidx
  on public.scanner_halts (firm_id, ticker)
  where status = 'halted' and resumed_at is null;

create table public.scanner_presets (
  id uuid primary key default gen_random_uuid(),
  firm_id uuid not null references public.firms (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  system text not null check (system in ('momentum', 'desk')),
  layout jsonb not null default '{}'::jsonb,
  is_default boolean not null default false,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create unique index scanner_presets_user_name_uidx
  on public.scanner_presets (user_id, name);

create index scanner_presets_user_updated_idx
  on public.scanner_presets (user_id, updated_at desc);

create trigger scanner_presets_set_updated_at
  before update on public.scanner_presets
  for each row
  execute function public.set_updated_at();

create table public.scanner_alert_settings (
  user_id uuid primary key references auth.users (id) on delete cascade,
  firm_id uuid not null references public.firms (id) on delete cascade,
  settings jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default timezone('utc', now())
);

create trigger scanner_alert_settings_set_updated_at
  before update on public.scanner_alert_settings
  for each row
  execute function public.set_updated_at();

create table public.scanner_pins (
  user_id uuid not null references auth.users (id) on delete cascade,
  firm_id uuid not null references public.firms (id) on delete cascade,
  ticker text not null,
  created_at timestamptz not null default timezone('utc', now()),
  primary key (user_id, ticker)
);

create table public.scanner_mutes (
  user_id uuid not null references auth.users (id) on delete cascade,
  firm_id uuid not null references public.firms (id) on delete cascade,
  ticker text not null,
  strategy_id text not null default '*',
  muted_until timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  primary key (user_id, ticker, strategy_id)
);

alter table public.scanner_runs enable row level security;
alter table public.scanner_feature_snapshots enable row level security;
alter table public.scanner_feature_history enable row level security;
alter table public.scanner_ranked_rows enable row level security;
alter table public.scanner_alert_events enable row level security;
alter table public.scanner_ticker_profiles enable row level security;
alter table public.scanner_halts enable row level security;
alter table public.scanner_presets enable row level security;
alter table public.scanner_alert_settings enable row level security;
alter table public.scanner_pins enable row level security;
alter table public.scanner_mutes enable row level security;

create policy scanner_runs_select_member
  on public.scanner_runs for select to authenticated
  using (public.auth_is_active_member() and firm_id = public.auth_firm_id());

create policy scanner_feature_snapshots_select_member
  on public.scanner_feature_snapshots for select to authenticated
  using (public.auth_is_active_member() and firm_id = public.auth_firm_id());

create policy scanner_feature_history_select_member
  on public.scanner_feature_history for select to authenticated
  using (public.auth_is_active_member() and firm_id = public.auth_firm_id());

create policy scanner_ranked_rows_select_member
  on public.scanner_ranked_rows for select to authenticated
  using (public.auth_is_active_member() and firm_id = public.auth_firm_id());

create policy scanner_alert_events_select_member
  on public.scanner_alert_events for select to authenticated
  using (public.auth_is_active_member() and firm_id = public.auth_firm_id());

create policy scanner_ticker_profiles_select_member
  on public.scanner_ticker_profiles for select to authenticated
  using (public.auth_is_active_member() and firm_id = public.auth_firm_id());

create policy scanner_halts_select_member
  on public.scanner_halts for select to authenticated
  using (public.auth_is_active_member() and firm_id = public.auth_firm_id());

create policy scanner_presets_select_own
  on public.scanner_presets for select to authenticated
  using (
    public.auth_is_active_member()
    and firm_id = public.auth_firm_id()
    and user_id = auth.uid()
  );

create policy scanner_presets_insert_own
  on public.scanner_presets for insert to authenticated
  with check (
    public.auth_is_active_member()
    and firm_id = public.auth_firm_id()
    and user_id = auth.uid()
  );

create policy scanner_presets_update_own
  on public.scanner_presets for update to authenticated
  using (
    public.auth_is_active_member()
    and firm_id = public.auth_firm_id()
    and user_id = auth.uid()
  )
  with check (
    public.auth_is_active_member()
    and firm_id = public.auth_firm_id()
    and user_id = auth.uid()
  );

create policy scanner_presets_delete_own
  on public.scanner_presets for delete to authenticated
  using (
    public.auth_is_active_member()
    and firm_id = public.auth_firm_id()
    and user_id = auth.uid()
  );

create policy scanner_alert_settings_select_own
  on public.scanner_alert_settings for select to authenticated
  using (
    public.auth_is_active_member()
    and firm_id = public.auth_firm_id()
    and user_id = auth.uid()
  );

create policy scanner_alert_settings_insert_own
  on public.scanner_alert_settings for insert to authenticated
  with check (
    public.auth_is_active_member()
    and firm_id = public.auth_firm_id()
    and user_id = auth.uid()
  );

create policy scanner_alert_settings_update_own
  on public.scanner_alert_settings for update to authenticated
  using (
    public.auth_is_active_member()
    and firm_id = public.auth_firm_id()
    and user_id = auth.uid()
  )
  with check (
    public.auth_is_active_member()
    and firm_id = public.auth_firm_id()
    and user_id = auth.uid()
  );

create policy scanner_pins_select_own
  on public.scanner_pins for select to authenticated
  using (
    public.auth_is_active_member()
    and firm_id = public.auth_firm_id()
    and user_id = auth.uid()
  );

create policy scanner_pins_insert_own
  on public.scanner_pins for insert to authenticated
  with check (
    public.auth_is_active_member()
    and firm_id = public.auth_firm_id()
    and user_id = auth.uid()
  );

create policy scanner_pins_delete_own
  on public.scanner_pins for delete to authenticated
  using (
    public.auth_is_active_member()
    and firm_id = public.auth_firm_id()
    and user_id = auth.uid()
  );

create policy scanner_mutes_select_own
  on public.scanner_mutes for select to authenticated
  using (
    public.auth_is_active_member()
    and firm_id = public.auth_firm_id()
    and user_id = auth.uid()
  );

create policy scanner_mutes_insert_own
  on public.scanner_mutes for insert to authenticated
  with check (
    public.auth_is_active_member()
    and firm_id = public.auth_firm_id()
    and user_id = auth.uid()
  );

create policy scanner_mutes_update_own
  on public.scanner_mutes for update to authenticated
  using (
    public.auth_is_active_member()
    and firm_id = public.auth_firm_id()
    and user_id = auth.uid()
  )
  with check (
    public.auth_is_active_member()
    and firm_id = public.auth_firm_id()
    and user_id = auth.uid()
  );

create policy scanner_mutes_delete_own
  on public.scanner_mutes for delete to authenticated
  using (
    public.auth_is_active_member()
    and firm_id = public.auth_firm_id()
    and user_id = auth.uid()
  );

revoke insert, update, delete on public.scanner_runs from authenticated, anon;
revoke insert, update, delete on public.scanner_feature_snapshots from authenticated, anon;
revoke insert, update, delete on public.scanner_feature_history from authenticated, anon;
revoke insert, update, delete on public.scanner_ranked_rows from authenticated, anon;
revoke insert, update, delete on public.scanner_alert_events from authenticated, anon;
revoke insert, update, delete on public.scanner_ticker_profiles from authenticated, anon;
revoke insert, update, delete on public.scanner_halts from authenticated, anon;

create or replace function private.prune_scanner_history()
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  delete from public.scanner_feature_history
  where captured_at < timezone('utc', now()) - interval '7 days';

  delete from public.scanner_alert_events
  where fired_at < timezone('utc', now()) - interval '90 days';

  delete from public.scanner_ranked_rows
  where captured_at < timezone('utc', now()) - interval '14 days';

  delete from public.scanner_runs
  where started_at < timezone('utc', now()) - interval '30 days';
end;
$$;

revoke all on function private.prune_scanner_history() from public, anon, authenticated;
grant execute on function private.prune_scanner_history() to postgres, service_role;

create or replace function private.invoke_scanner_cron()
returns bigint
language plpgsql
security definer
set search_path = public, net, vault
as $$
declare
  request_id bigint;
  app_url text;
  cron_secret text;
begin
  select decrypted_secret into app_url
  from vault.decrypted_secrets
  where name = 'brokerage_cron_url'
  limit 1;

  select decrypted_secret into cron_secret
  from vault.decrypted_secrets
  where name = 'brokerage_cron_secret'
  limit 1;

  if cron_secret is null or btrim(cron_secret) = '' then
    raise warning 'scanner cron skipped: vault secret brokerage_cron_secret is missing';
    return null;
  end if;

  app_url := rtrim(
    coalesce(nullif(btrim(app_url), ''), 'https://ibmarketdata.vercel.app'),
    '/'
  );

  select net.http_post(
    url := app_url || '/api/cron/scanner',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || cron_secret
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 100000
  )
  into request_id;

  return request_id;
end;
$$;

revoke all on function private.invoke_scanner_cron() from public, anon, authenticated;
grant execute on function private.invoke_scanner_cron() to postgres;

select cron.unschedule(jobid)
from cron.job
where jobname = 'scanner-center-tick';

select cron.schedule(
  'scanner-center-tick',
  '* * * * *',
  $$select private.invoke_scanner_cron()$$
);

select cron.unschedule(jobid)
from cron.job
where jobname = 'scanner-center-prune';

select cron.schedule(
  'scanner-center-prune',
  '23 7 * * *',
  $$select private.prune_scanner_history()$$
);
