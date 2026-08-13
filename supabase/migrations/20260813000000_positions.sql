-- Shared firm position blotter. Marks and P&L are computed at read time
-- from market-data adapters; this table stores the manual book only.

create type public.position_asset_type as enum (
  'equity',
  'etf',
  'option',
  'future',
  'crypto',
  'other'
);

create type public.position_side as enum ('long', 'short');

create type public.position_status as enum ('open', 'closed');

create table public.positions (
  id uuid primary key default gen_random_uuid(),
  firm_id uuid not null references public.firms (id) on delete cascade,
  ticker text not null,
  asset_type public.position_asset_type not null default 'equity',
  side public.position_side not null default 'long',
  quantity numeric(20, 8) not null,
  multiplier numeric(20, 8) not null default 1,
  entry_price numeric(20, 8) not null,
  entry_date date not null,
  currency text not null default 'USD',
  strategy text,
  notes text,
  status public.position_status not null default 'open',
  close_price numeric(20, 8),
  close_date date,
  closed_at timestamptz,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint positions_quantity_positive check (quantity > 0),
  constraint positions_multiplier_positive check (multiplier > 0),
  constraint positions_entry_price_positive check (entry_price > 0),
  constraint positions_close_price_positive check (
    close_price is null or close_price > 0
  ),
  constraint positions_ticker_format check (ticker ~ '^[A-Z][A-Z0-9.=^-]{0,20}$'),
  constraint positions_closed_fields check (
    (status = 'open' and close_price is null and close_date is null and closed_at is null)
    or
    (status = 'closed' and close_price is not null and close_date is not null and closed_at is not null)
  )
);

create index positions_firm_status_idx
  on public.positions (firm_id, status, created_at);

create index positions_firm_ticker_idx
  on public.positions (firm_id, ticker);

create trigger positions_set_updated_at
  before update on public.positions
  for each row execute function public.set_updated_at();

alter table public.positions enable row level security;

create policy positions_select_firm
  on public.positions for select to authenticated
  using (firm_id = public.auth_firm_id() and public.auth_is_active_member());

create policy positions_insert_member
  on public.positions for insert to authenticated
  with check (firm_id = public.auth_firm_id() and public.auth_is_active_member());

create policy positions_update_member
  on public.positions for update to authenticated
  using (firm_id = public.auth_firm_id() and public.auth_is_active_member())
  with check (firm_id = public.auth_firm_id() and public.auth_is_active_member());

create policy positions_delete_member
  on public.positions for delete to authenticated
  using (firm_id = public.auth_firm_id() and public.auth_is_active_member());
