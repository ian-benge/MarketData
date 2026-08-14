-- Optional SnapTrade brokerage sync. Manual lots stay the source of
-- truth unless a holding is imported from a connected account.
-- SnapTrade user_secret is stored server-side only — never brokerage
-- passwords or API keys.

create type public.position_source as enum ('manual', 'snaptrade');

create type public.brokerage_connection_status as enum (
  'connected',
  'disabled',
  'reconnect_required'
);

create table public.snaptrade_users (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  firm_id uuid not null references public.firms (id) on delete cascade,
  snaptrade_user_id text not null unique,
  user_secret text not null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table public.brokerage_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  firm_id uuid not null references public.firms (id) on delete cascade,
  snaptrade_authorization_id text not null,
  brokerage_slug text not null,
  brokerage_name text not null,
  status public.brokerage_connection_status not null default 'connected',
  last_sync_at timestamptz,
  last_sync_error text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint brokerage_connections_auth_unique unique (snaptrade_authorization_id)
);

create index brokerage_connections_user_idx
  on public.brokerage_connections (firm_id, user_id);

create table public.brokerage_accounts (
  id uuid primary key default gen_random_uuid(),
  connection_id uuid not null references public.brokerage_connections (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  firm_id uuid not null references public.firms (id) on delete cascade,
  snaptrade_account_id text not null,
  name text not null,
  number_masked text,
  account_type text,
  book_id uuid references public.position_books (id) on delete set null,
  sync_enabled boolean not null default true,
  cash_balance numeric(20, 2),
  last_sync_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint brokerage_accounts_snaptrade_unique unique (snaptrade_account_id)
);

create index brokerage_accounts_user_idx
  on public.brokerage_accounts (firm_id, user_id);

create unique index brokerage_accounts_book_idx
  on public.brokerage_accounts (book_id)
  where book_id is not null;

alter table public.positions
  add column source public.position_source not null default 'manual',
  add column brokerage_account_id uuid references public.brokerage_accounts (id) on delete set null,
  add column external_id text,
  add column brokerage_name text;

alter table public.position_books
  add column source public.position_source not null default 'manual';

alter table public.positions
  add constraint positions_synced_identity check (
    source = 'manual'
    or status = 'closed'
    or (
      source = 'snaptrade'
      and brokerage_account_id is not null
      and external_id is not null
    )
  );

create unique index positions_open_synced_identity_idx
  on public.positions (brokerage_account_id, external_id)
  where source = 'snaptrade'
    and status = 'open'
    and brokerage_account_id is not null
    and external_id is not null;

create index positions_source_idx
  on public.positions (firm_id, source, status);

create trigger snaptrade_users_set_updated_at
  before update on public.snaptrade_users
  for each row execute function public.set_updated_at();

create trigger brokerage_connections_set_updated_at
  before update on public.brokerage_connections
  for each row execute function public.set_updated_at();

create trigger brokerage_accounts_set_updated_at
  before update on public.brokerage_accounts
  for each row execute function public.set_updated_at();

alter table public.snaptrade_users enable row level security;
alter table public.brokerage_connections enable row level security;
alter table public.brokerage_accounts enable row level security;

-- user_secret never leaves the owner's row. Admins viewing a blotter
-- do not need it; sync runs as the connection owner.
create policy snaptrade_users_select_own
  on public.snaptrade_users for select to authenticated
  using (user_id = auth.uid() and public.auth_is_active_member());

create policy snaptrade_users_insert_own
  on public.snaptrade_users for insert to authenticated
  with check (
    user_id = auth.uid()
    and firm_id = public.auth_firm_id()
    and public.auth_is_active_member()
  );

create policy snaptrade_users_update_own
  on public.snaptrade_users for update to authenticated
  using (user_id = auth.uid() and public.auth_is_active_member())
  with check (
    user_id = auth.uid()
    and firm_id = public.auth_firm_id()
    and public.auth_is_active_member()
  );

create policy snaptrade_users_delete_own
  on public.snaptrade_users for delete to authenticated
  using (user_id = auth.uid() and public.auth_is_active_member());

create policy brokerage_connections_select_firm
  on public.brokerage_connections for select to authenticated
  using (firm_id = public.auth_firm_id() and public.auth_is_active_member());

create policy brokerage_connections_insert_own
  on public.brokerage_connections for insert to authenticated
  with check (
    firm_id = public.auth_firm_id()
    and public.auth_is_active_member()
    and user_id = auth.uid()
  );

create policy brokerage_connections_update_own
  on public.brokerage_connections for update to authenticated
  using (
    firm_id = public.auth_firm_id()
    and public.auth_is_active_member()
    and user_id = auth.uid()
  )
  with check (
    firm_id = public.auth_firm_id()
    and public.auth_is_active_member()
    and user_id = auth.uid()
  );

create policy brokerage_connections_delete_own
  on public.brokerage_connections for delete to authenticated
  using (
    firm_id = public.auth_firm_id()
    and public.auth_is_active_member()
    and user_id = auth.uid()
  );

create policy brokerage_accounts_select_firm
  on public.brokerage_accounts for select to authenticated
  using (firm_id = public.auth_firm_id() and public.auth_is_active_member());

create policy brokerage_accounts_insert_own
  on public.brokerage_accounts for insert to authenticated
  with check (
    firm_id = public.auth_firm_id()
    and public.auth_is_active_member()
    and user_id = auth.uid()
  );

create policy brokerage_accounts_update_own
  on public.brokerage_accounts for update to authenticated
  using (
    firm_id = public.auth_firm_id()
    and public.auth_is_active_member()
    and user_id = auth.uid()
  )
  with check (
    firm_id = public.auth_firm_id()
    and public.auth_is_active_member()
    and user_id = auth.uid()
  );

create policy brokerage_accounts_delete_own
  on public.brokerage_accounts for delete to authenticated
  using (
    firm_id = public.auth_firm_id()
    and public.auth_is_active_member()
    and user_id = auth.uid()
  );
